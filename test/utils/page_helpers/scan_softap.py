# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
SoftAP Connect to Device Page Helper

Android lists nearby SoftAP devices for selection; iOS shows join
instructions with a single Connect action (the OS network-join dialog
is cleared by the system alert handling).
"""
import logging
import os
import time

from .base import BasePage

logger = logging.getLogger(__name__)


class ScanSoftap(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)


    def grant_runtime_permissions_if_needed(self):
        """Grant location permission when the in-app prompt is shown."""
        if self.is_visible("button_permission", timeout=1):
            logger.info("SoftAP permission prompt detected; granting permissions")
            self.click("button_permission")
            permissions_page = self.get_other_page_helper("permissions")
            permissions_page.handle_all_permissions(action="allow", timeout=6)
        return self

    def connect_to_device(self, device_name: str = None, timeout=30):
        """
        Connect to the discovered SoftAP device.

        Android: select the device card matching device_name (first when None),
        then tap Connect. iOS: tap Connect and accept the system join dialog.

        @param device_name - SoftAP SSID from the provisioning payload (PROV_xxxxxx)
        """
        self.grant_runtime_permissions_if_needed()

        if self.platform == "ios":
            self._ios_connect_via_settings(device_name)
        else:
            self._android_connect(device_name, timeout)

        # Joining the SoftAP and handshaking is slow; block until the device
        # connection settles on the next screen — PoP (sec1 random PoP) or
        # Connect Wi-Fi — so the following step's assertion isn't racing it.
        pop = self.get_other_page_helper("pop")
        connect_wifi = self.get_other_page_helper("connect_wifi")
        for _ in range(10):
            if pop.check_screen_displayed(timeout=1, quiet=True) or \
               connect_wifi.check_screen_displayed(timeout=1, quiet=True):
                return True
            time.sleep(1)
        logger.warning("Neither PoP nor Connect Wi-Fi screen appeared within ~20s of SoftAP connect")
        return False

    def wait_for_devices(self, device_name=None, per_pass_timeout=15, max_passes=3):
        """Wait for the target SoftAP device card (specific SSID when given), re-scanning between passes."""
        target = device_name or "<any>"
        logger.info("Waiting for SoftAP target '%s' (up to %s passes)", target, max_passes)
        for pass_num in range(1, max_passes + 1):
            if self._target_device_visible(device_name, per_pass_timeout):
                logger.info("SoftAP target '%s' discovered on pass %s/%s", target, pass_num, max_passes)
                return self
            if pass_num >= max_passes:
                break
            self._refresh_wifi_scan()

            if self.is_visible("rescan_button", timeout=5):
                logger.info("Target '%s' absent on pass %s/%s; rescanning SoftAP (populated list)", target, pass_num, max_passes)
                self.click("rescan_button")
            elif self.is_visible("rescan_button_empty", timeout=3):
                logger.info("Target '%s' absent on pass %s/%s; rescanning SoftAP (empty state)", target, pass_num, max_passes)
                self.click("rescan_button_empty")
            else:
                logger.warning("Target '%s' absent and no Rescan control on pass %s; waiting again", target, pass_num)
        raise RuntimeError(f"No SoftAP device '{target}' discovered after {max_passes} discovery passes")

    def _target_device_visible(self, device_name, timeout):
        """True when the named device card is shown (or any card when unnamed)."""
        if not device_name:
            return self.is_visible("device_card", timeout=timeout)
        deadline = time.time() + timeout
        while time.time() < deadline:
            for label in self.find_all("device_name_text"):
                try:
                    if (label.text or "").strip() == device_name and label.is_displayed():
                        return True
                except Exception:
                    continue
            time.sleep(1)
        return False

    def _refresh_wifi_scan(self):
        """Force a fresh Wi-Fi scan by toggling Wi-Fi off then on (no-op on iOS); delegates to phone_settings."""
        if self.platform != "android":
            return
        ps = self.get_other_page_helper("phone_settings")
        ps.set_wifi(False)
        ps.set_wifi(True)

    def _android_connect(self, device_name, timeout):
        """Android: pick the device card, tap Connect, accept the OS join dialog."""
        self.wait_for_devices(device_name, per_pass_timeout=max(timeout // 3, 5))
        if device_name:
            for label in self.find_all("device_name_text"):
                if (label.text or "").strip() == device_name and label.is_displayed():
                    logger.info("Selecting SoftAP device: %s", device_name)
                    label.click()
                    break
            else:
                raise RuntimeError(f"SoftAP device '{device_name}' not found in scan results")
        else:
            logger.info("Selecting first discovered SoftAP device")
            self.click("device_card", timeout=5)

        logger.info("Tapping Connect on SoftAP screen")
        self.click("connect_button", timeout=10)

        # Joining the device's temporary Wi-Fi raises a WifiNetworkSpecifier "Connect to device?" dialog.
        if self.is_visible("system_join_connect", timeout=8):
            logger.info("Accepting OS join-network dialog")
            self.click("system_join_connect")
        else:
            self.get_other_page_helper("permissions").handle_all_permissions(action="allow", timeout=4)

    def _ios_connect_via_settings(self, device_name):
        """iOS SoftAP connect: grant Location, join the PROV_xxxx hotspot via Settings, tap Connect, accept the join alert."""
        if not device_name:
            raise RuntimeError("iOS SoftAP join needs the device SSID from the serial payload")
        perms = self.get_other_page_helper("permissions")
        bundle_id = self.driver.capabilities.get("bundleId", "com.espressif.nova")

        try:
            self.driver.terminate_app("com.apple.Preferences")
        except Exception:
            pass

        logger.info("Tapping Connect on iOS SoftAP screen")
        self.click("connect_button", timeout=10)
        # The app's NEHotspotConfiguration raises an iOS "Join Wi-Fi Network" prompt — ACCEPT it (that IS the provisioning join).
        perms.handle_all_permissions(action="allow", timeout=8, accept_join=True)

        pop = self.get_other_page_helper("pop")
        connect_wifi = self.get_other_page_helper("connect_wifi")

        if perms.any_system_alert_present(timeout=2):
            perms.handle_all_permissions(action="allow", timeout=3, accept_join=True)

        already_advanced = pop.check_screen_displayed(timeout=1, quiet=True) or \
            connect_wifi.check_screen_displayed(timeout=1, quiet=True)
        if already_advanced:
            return
        joined = self._ios_join_wifi_in_settings(device_name)
        if not joined:
            self.driver.activate_app(bundle_id)
            # No PROV_ join means provisioning cannot proceed — fail immediately instead of waiting for a next screen that will never appear.
            raise RuntimeError(
                f"iOS SoftAP join failed: '{device_name}' never appeared in / could not be joined from the "
                "Wi-Fi list; the device SoftAP is not discoverable from the iPhone")
        logger.info("Returning to app %s after confirmed join of %s", bundle_id, device_name)
        self.driver.activate_app(bundle_id)
        if self.is_visible("connect_button", timeout=10):
            self.click("connect_button")

        for _ in range(20):
            if perms.any_system_alert_present(timeout=1):
                perms.handle_all_permissions(action="allow", timeout=3, accept_join=True)
            if pop.check_screen_displayed(timeout=1, quiet=True) or \
               connect_wifi.check_screen_displayed(timeout=1, quiet=True):
                break
            time.sleep(1)

    def _ios_tap_first(self, predicates, timeout=5):
        """Tap the first element matching any of `predicates` (delegates to the shared phone_settings primitive)."""
        return self.get_other_page_helper("phone_settings").ios_tap_first(predicates, timeout)

    def _ios_settings_goto_root(self, timeout=12):
        """Walk back to the root iOS Settings pane (delegates to the shared phone_settings primitive)."""
        return self.get_other_page_helper("phone_settings").ios_settings_goto_root(timeout)

    def _ios_join_wifi_in_settings(self, ssid, timeout=35):
        """Drive the iOS Settings app to join the open PROV_xxxx network (reset Settings, step into Wi-Fi, tap the cell)."""
        prefs = "com.apple.Preferences"
        try:
            self.driver.terminate_app(prefs)
            time.sleep(1)
        except Exception:
            pass
        self.driver.activate_app(prefs)
        time.sleep(2)

        if not self._ios_settings_goto_root(timeout=12):
            logger.warning("Could not reach root iOS Settings pane")

        if not self._ios_tap_first(
            ["name == 'Wi-Fi'", "label BEGINSWITH 'Wi-Fi'", "name == 'WLAN'", "label BEGINSWITH 'WLAN'"],
            timeout=10,
        ):
            logger.warning("Wi-Fi row not found on root Settings")
            return False
        time.sleep(2)

        if self._ios_wait_and_tap_ssid(ssid, timeout=10):
            return True
        logger.info("SoftAP '%s' not listed within 10s; toggling Wi-Fi to force a rescan", ssid)
        self._ios_toggle_wifi()
        if self._ios_wait_and_tap_ssid(ssid, timeout=max(timeout - 10, 10)):
            return True
        logger.warning("SoftAP network '%s' never appeared in iOS Wi-Fi list (even after Wi-Fi toggle)", ssid)
        return False

    def _ios_wait_and_tap_ssid(self, ssid, timeout, join_attempts=3):
        """Poll the iOS Wi-Fi list for the PROV_ cell, tap it, and verify the join"""
        perms = self.get_other_page_helper("permissions")
        deadline = time.time() + max(timeout, 2)
        while time.time() < deadline:
            if self._ios_tap_first(
                [f"name BEGINSWITH '{ssid}'", f"label BEGINSWITH '{ssid}'"], timeout=2
            ):
                break
            time.sleep(2)
        else:
            return False

        for attempt in range(1, join_attempts + 1):
            logger.info("Tapped '%s' in iOS Wi-Fi Settings (join attempt %d/%d)", ssid, attempt, join_attempts)
            perms.handle_all_permissions(action="allow", timeout=2)
            if self._ios_is_ssid_joined(ssid, timeout=10):
                logger.info("Confirmed iOS joined '%s'", ssid)
                return True
            logger.warning("'%s' tapped but not joined yet; re-tapping", ssid)
            if attempt < join_attempts and not self._ios_tap_first(
                [f"name BEGINSWITH '{ssid}'", f"label BEGINSWITH '{ssid}'"], timeout=4
            ):
                break
        logger.warning("iOS did not join '%s' after %d attempts", ssid, join_attempts)
        return False

    def _ios_is_ssid_joined(self, ssid, timeout=10):
        """True when the Settings Wi-Fi pane shows ``ssid`` as the connected network."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                if self.driver.find_elements(
                    "-ios predicate string",
                    "label == 'Forget This Network' OR name == 'Forget This Network'",
                ):
                    return True
                headers = self.driver.find_elements(
                    "-ios predicate string",
                    "type == 'XCUIElementTypeStaticText' AND (label == 'My Networks' OR label == 'Other Networks' OR label == 'NETWORKS')",
                )
                head_y = min((h.rect["y"] for h in headers), default=None)
            except Exception:
                head_y = None
            for pred in (f"name BEGINSWITH '{ssid}'", f"label BEGINSWITH '{ssid}'"):
                try:
                    cells = self.driver.find_elements("-ios predicate string", pred)
                except Exception:
                    cells = []
                for cell in cells:
                    try:
                        if (cell.get_attribute("selected") or "").lower() == "true":
                            return True
                        value = (cell.get_attribute("value") or "").lower()
                        label = (cell.get_attribute("label") or "").lower()
                        if "connect" in value or "selected" in label:
                            return True
                        r = cell.rect
                        if head_y is not None and r["y"] + r["height"] <= head_y + 4:
                            return True
                    except Exception:
                        continue
            time.sleep(1)
        return False

    def _ios_toggle_wifi(self):
        """Toggle the iOS Wi-Fi switch off then on to force a re-scan for open PROV_ networks."""
        for _ in range(2):
            if not self._ios_tap_first(["type == 'XCUIElementTypeSwitch'"], timeout=3):
                break
            time.sleep(3)

    def restore_home_wifi(self, home_ssid=None):
        """iOS teardown: disable Auto-Join on the open PROV_ hotspots and rejoin the home network (no-op on Android)."""
        if self.platform != "ios":
            return
        home_ssid = home_ssid or os.getenv("PROVISION_WIFI_SSID", "ESP_App_Framework")
        prefs = "com.apple.Preferences"
        bundle_id = self.driver.capabilities.get("bundleId", "com.espressif.nova")
        try:
            try:
                self.driver.terminate_app(prefs)
                time.sleep(1)
            except Exception:
                pass
            self.driver.activate_app(prefs)
            time.sleep(2)
            self._ios_settings_goto_root(timeout=12)
            if not self._ios_tap_first(
                ["name == 'Wi-Fi'", "label BEGINSWITH 'Wi-Fi'", "name == 'WLAN'", "label BEGINSWITH 'WLAN'"],
                timeout=10,
            ):
                logger.warning("restore_home_wifi: Wi-Fi row not found on root Settings")
                return
            time.sleep(2)
            # Toggle Wi-Fi to force a fresh scan so PROV_ and the home network re-list.
            self._ios_toggle_wifi()
            time.sleep(5)
            disabled = self._ios_disable_prov_autojoin()
            self._ios_return_to_wifi_list()
            logger.info("restore_home_wifi: disabled Auto-Join on %d PROV_ network(s); rejoining '%s'", disabled, home_ssid)
            if self._ios_rejoin_ssid(home_ssid):
                logger.info("restore_home_wifi: phone back on '%s'", home_ssid)
            else:
                logger.warning("restore_home_wifi: could not confirm rejoin of '%s'", home_ssid)
        finally:
            try:
                self.driver.terminate_app(prefs)
            except Exception:
                pass
            try:
                self.driver.activate_app(bundle_id)
                time.sleep(2)
            except Exception:
                pass

    def _ios_disable_prov_autojoin(self, max_networks=6):
        """Disable Auto-Join on every saved PROV_* network (without forgetting it) and return the count changed."""
        changed = 0
        seen = set()
        for _ in range(max_networks):
            target = None
            for cell in self.driver.find_elements(
                "-ios predicate string",
                "type == 'XCUIElementTypeCell' AND (name BEGINSWITH 'PROV_' OR label BEGINSWITH 'PROV_')",
            ):
                name = (cell.get_attribute("name") or cell.get_attribute("label") or "")
                ssid = name.split(",")[0].strip()
                if ssid and ssid not in seen:
                    target = ssid
                    break
            if not target:
                return changed
            seen.add(target)
            info = None
            try:
                info = self.driver.find_element(
                    "-ios class chain",
                    f'**/XCUIElementTypeCell[`name BEGINSWITH "{target}"`]/**/XCUIElementTypeButton[`name == "More Info"`]',
                )
            except Exception:
                info = None
            if info is None:
                logger.warning("restore_home_wifi: no More Info button for %s; stopping", target)
                return changed
            info.click()
            time.sleep(2)
            switch = None
            for chain in (
                '**/XCUIElementTypeCell[`name == "Auto-Join" OR label == "Auto-Join"`]/**/XCUIElementTypeSwitch',
                '**/XCUIElementTypeSwitch[`label == "Auto-Join" OR name == "Auto-Join"`]',
            ):
                try:
                    switch = self.driver.find_element("-ios class chain", chain)
                    break
                except Exception:
                    continue
            if switch is None:
                # Never flip an unlabelled switch: the detail pane also has other switches — skip rather than toggle the wrong one.
                logger.warning("restore_home_wifi: Auto-Join switch not found for %s; leaving as-is", target)
            elif (switch.get_attribute("value") or "").strip() in ("1", "true", "On", "on"):
                switch.click()
                logger.info("restore_home_wifi: disabled Auto-Join for %s", target)
                changed += 1
            else:
                logger.info("restore_home_wifi: Auto-Join already off for %s", target)
            self._ios_return_to_wifi_list()
            time.sleep(1)
        return changed

    def _ios_rejoin_ssid(self, ssid, attempts=4):
        """Rejoin a saved network by tapping its cell at its coordinates (the Wi-Fi list live-refreshes, so element clicks go stale)."""
        pred = f"type == 'XCUIElementTypeCell' AND (name BEGINSWITH '{ssid}' OR label BEGINSWITH '{ssid}')"
        for attempt in range(1, attempts + 1):
            tapped = False
            try:
                cell = self.driver.find_element("-ios predicate string", pred)
                rect = cell.rect
                self.driver.execute_script(
                    "mobile: tap", {"x": rect["x"] + rect["width"] / 2, "y": rect["y"] + rect["height"] / 2})
                tapped = True
            except Exception:
                logger.info("restore_home_wifi: '%s' not tappable on attempt %d", ssid, attempt)
            if tapped:
                deadline = time.time() + 14
                while time.time() < deadline:
                    if self._ios_network_connected(ssid):
                        return True
                    time.sleep(1.5)
            self._ios_toggle_wifi()
            time.sleep(3)
        return self._ios_network_connected(ssid)

    def _ios_network_connected(self, ssid):
        """True when ``ssid`` is the connected network (its Wi-Fi-list cell is marked selected)."""
        try:
            for c in self.driver.find_elements(
                "-ios predicate string",
                f"type == 'XCUIElementTypeCell' AND (name BEGINSWITH '{ssid}' OR label BEGINSWITH '{ssid}')",
            ):
                if (c.get_attribute("selected") or "").lower() == "true":
                    return True
        except Exception:
            pass
        return False

    def _ios_return_to_wifi_list(self, timeout=8):
        """Back out of a network detail pane to the Wi-Fi list."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                self.driver.find_element(
                    "-ios predicate string",
                    "type == 'XCUIElementTypeNavigationBar' AND (name == 'Wi-Fi' OR name == 'WLAN')",
                )
                return True
            except Exception:
                pass
            try:
                self.driver.find_element(
                    "-ios class chain", "**/XCUIElementTypeNavigationBar/XCUIElementTypeButton[1]"
                ).click()
            except Exception:
                pass
            time.sleep(0.8)
        return False

    def validate_screen_elements(self):
        """Validate expected elements on the SoftAP screen."""
        logger.info("Validating SoftAP screen elements")

        required_elements = [
            "title",
            "connect_button",
        ]

        missing_elements = []
        for element in required_elements:
            if not self.is_visible(element, timeout=5):
                missing_elements.append(element)

        if missing_elements:
            raise Exception(f"Missing SoftAP screen elements: {missing_elements}")

        logger.info("SoftAP screen elements validated successfully")
        return True
