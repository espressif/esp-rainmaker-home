# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Phone Settings Helper — system Wi-Fi control via the Settings UI (Android blocks `svc wifi` on some devices)."""
import logging
import subprocess
import time

from appium.webdriver.common.appiumby import AppiumBy

from utils.phone_network import adb_prefix
from .base import BasePage

logger = logging.getLogger(__name__)


class PhoneSettings(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)

    def _adb_prefix(self):
        return adb_prefix(self.driver)

    def wifi_enabled(self):
        """Radio state from dumpsys (the Settings switch UI can lie on some devices)."""
        result = subprocess.run(self._adb_prefix() + ["shell", "dumpsys", "wifi"],
                                capture_output=True, text=True, timeout=15)
        for line in result.stdout.splitlines():
            if "Wi-Fi is" in line:
                return "enabled" in line
        return None

    def set_wifi(self, enabled, timeout=25):
        """Set the Wi-Fi radio via the Settings UI toggle (both platforms)."""
        if self.platform == "ios":
            return self._ios_set_wifi(enabled, timeout)
        if self.wifi_enabled() == enabled:
            return True
        adb = self._adb_prefix()
        subprocess.run(adb + ["shell", "am", "start", "-a", "android.settings.WIFI_SETTINGS"],
                       check=False, capture_output=True, timeout=15)
        time.sleep(4)
        try:
            self.driver.find_element(AppiumBy.ID, "com.android.settings:id/switchWidget").click()
        except Exception as exc:
            logger.warning("Wi-Fi settings toggle tap failed: %s", exc)
        deadline = time.time() + timeout
        state = None
        while time.time() < deadline:
            state = self.wifi_enabled()
            if state == enabled:
                break
            time.sleep(2)
        subprocess.run(adb + ["shell", "input", "keyevent", "KEYCODE_BACK"],
                       check=False, capture_output=True, timeout=10)
        app_package = self.driver.capabilities.get("appPackage")
        self.driver.activate_app(app_package)
        time.sleep(2)
        if state != enabled:
            logger.warning("Wi-Fi radio did not reach %s (dumpsys says %s); Settings toggle may be UI-only on this device",
                           "enabled" if enabled else "disabled", state)
            return False
        logger.info("Wi-Fi radio is now %s", "enabled" if enabled else "disabled")
        return True

    def ios_tap_first(self, predicates, timeout=5):
        """Tap the first iOS element matching any of `predicates` within `timeout` (shared Settings-nav primitive)."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            for pred in predicates:
                try:
                    self.driver.find_element("-ios predicate string", pred).click()
                    return True
                except Exception:
                    continue
            time.sleep(0.5)
        return False

    def ios_settings_goto_root(self, timeout=12):
        """Walk the iOS Settings app back to its root pane (NavigationBar titled 'Settings')."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                self.driver.find_element("-ios predicate string",
                                         "type == 'XCUIElementTypeNavigationBar' AND name == 'Settings'")
                return True
            except Exception:
                pass
            try:
                self.driver.find_element("-ios class chain",
                                         "**/XCUIElementTypeNavigationBar/XCUIElementTypeButton[1]").click()
            except Exception:
                pass
            time.sleep(1)
        return False

    def _ios_wifi_switch_value(self):
        """'1'/'0' of the Wi-Fi master switch on the open iOS Wi-Fi pane, or None."""
        try:
            switch = self.driver.find_element("-ios predicate string", "type == 'XCUIElementTypeSwitch'")
            return (switch.get_attribute("value") or "").strip()
        except Exception:
            return None

    def _ios_set_wifi(self, enabled, timeout=25):
        """Toggle the iOS Wi-Fi radio via the Settings app, verified against the switch value."""
        prefs = "com.apple.Preferences"
        bundle = self.driver.capabilities.get("bundleId", "com.espressif.nova")
        target = "1" if enabled else "0"
        try:
            try:
                self.driver.terminate_app(prefs)
                time.sleep(1)
            except Exception:
                pass
            self.driver.activate_app(prefs)
            time.sleep(2)
            self.ios_settings_goto_root(timeout=12)
            if not self.ios_tap_first(
                ["name == 'Wi-Fi'", "label BEGINSWITH 'Wi-Fi'", "name == 'WLAN'", "label BEGINSWITH 'WLAN'"],
                timeout=10,
            ):
                logger.warning("iOS set_wifi: Wi-Fi row not found on root Settings")
                return False
            time.sleep(2)
            # Tap the switch at most once per attempt then poll to settle — re-tapping on a stale read toggles the radio back and forth.
            ok = self._ios_wifi_switch_value() == target
            for _ in range(3):
                if ok:
                    break
                self.ios_tap_first(["type == 'XCUIElementTypeSwitch'"], timeout=3)
                poll_end = time.time() + max(timeout // 2, 8)
                while time.time() < poll_end:
                    if self._ios_wifi_switch_value() == target:
                        ok = True
                        break
                    time.sleep(1)
            if not ok:
                logger.warning("iOS Wi-Fi did not reach %s", "on" if enabled else "off")
            else:
                logger.info("iOS Wi-Fi radio is now %s", "enabled" if enabled else "disabled")
            return ok
        finally:
            try:
                self.driver.terminate_app(prefs)
            except Exception:
                pass
            try:
                self.driver.activate_app(bundle)
                time.sleep(2)
            except Exception:
                pass
