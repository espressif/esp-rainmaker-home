# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""System permission dialog handler for Android and iOS."""
import logging
import time

from .base import BasePage

logger = logging.getLogger(__name__)


class Permissions(BasePage):
    """
    Clears permission prompts: the app's own purpose dialog first, then the OS
    dialogs across Android brands and iOS.

    On the Android CN build the app never shows a system permission prompt on
    its own. Every request is preceded by an in-app dialog naming the
    permission, the feature and what the data is used for, which does not
    auto-dismiss. The OS prompt only appears after that dialog is answered, so
    anything waiting on a system alert has to answer the in-app one first.
    Other builds show the OS prompts directly (Bluetooth + location at launch).
    """

    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)
        caps = driver.capabilities
        self.device_model = caps.get('deviceName', 'Unknown')
        self.os_version = caps.get('platformVersion', 'Unknown')
        self.manufacturer = self._detect_manufacturer()
        logger.info(
            "Permission handler initialized for %s %s - %s %s",
            self.platform, self.os_version, self.manufacturer, self.device_model,
        )

    def _click_by_key(self, locator_key: str, timeout: int = 2) -> bool:
        try:
            self.click(locator_key, None, timeout)
            return True
        except Exception:
            return False

    def _visible_by_key(self, locator_key: str, timeout: int = 2) -> bool:
        try:
            return self.find_visible(locator_key, None, timeout) is not None
        except Exception:
            return False

    def _detect_manufacturer(self):
        """Detect the device manufacturer to pick brand-specific button locators."""
        if self.platform == 'ios':
            return 'apple'
        model = self.device_model.lower()
        android_brands = {
            'samsung': ['sm-', 'galaxy', 'samsung'],
            'xiaomi': ['mi ', 'redmi', 'poco'],
            'oneplus': ['oneplus', 'op', 'nord'],
            'google': ['pixel', 'nexus'],
        }
        for brand, identifiers in android_brands.items():
            if any(identifier in model for identifier in identifiers):
                return brand
        return 'generic'

    def rationale_present(self, timeout=1) -> bool:
        """Return True while the app's in-app permission purpose dialog is shown."""
        return self._visible_by_key('rationale_allow', timeout)

    def handle_rationale_dialog(self, action='allow', timeout=2) -> bool:
        """
        Answer the app's in-app permission purpose dialog.

        On the Android CN build it is shown immediately before every OS
        permission prompt and never auto-dismisses, so the system dialog does
        not appear until this is answered. Returns True when a dialog was
        answered.
        """
        key = 'rationale_deny' if action == 'deny' else 'rationale_allow'
        if self._click_by_key(key, timeout):
            logger.info("In-app permission rationale %s - clicked '%s'", action, key)
            return True
        return False

    def handle_native_rationale_dialog(self, action='allow', timeout=2) -> bool:
        """
        Answer the native rationale AlertDialog shown by the in-app ChipTool
        Matter commissioning activity (the only screen that asks for a permission
        outside React Native).

        Deliberately not part of `handle_all_permissions`: it matches any
        AlertDialog button, so it is opt-in for the Matter flow rather than
        something the generic drain can click by accident.
        """
        key = 'native_rationale_deny' if action == 'deny' else 'native_rationale_allow'
        if self._click_by_key(key, timeout):
            logger.info("Native permission rationale %s - clicked '%s'", action, key)
            return True
        return False

    def any_system_alert_present(self, timeout=1) -> bool:
        """
        Probe for anything blocking the screen with a permission question: the
        app's in-app purpose dialog, or an OS permission dialog.

        Callers use this as the "is a permission prompt in the way?" gate before
        `handle_all_permissions`, so it has to cover the in-app dialog too — the
        OS prompt is queued behind it and would not be found on its own.
        """
        if self.rationale_present(timeout=min(timeout, 1)):
            return True
        return self._os_alert_present(timeout)

    def _os_alert_present(self, timeout=1) -> bool:
        """
        Probe for a blocking system permission dialog, polling up to `timeout`.

        iOS: WDA's alert API (raises instantly when no alert is shown), polled so
        an alert that appears slightly late isn't missed.
        Android: the permission-controller grant dialog container.
        """
        if self.platform == 'ios':
            deadline = time.monotonic() + max(timeout, 0)
            while True:
                try:
                    self.driver.execute_script("mobile: alert", {"action": "getButtons"})
                    return True
                except Exception:
                    if time.monotonic() >= deadline:
                        return False
                    time.sleep(0.3)
        return self._visible_by_key('android_permission_dialog', timeout)

    def handle_all_permissions(self, action='allow', timeout=5, accept_join=False):
        """
        Clear every permission prompt currently shown: the app's in-app purpose
        dialog and the system dialogs queued behind it (location, Bluetooth,
        local network, notifications, camera). Fast no-op when none is
        displayed, so it is safe to call from screen checks. Returns the list of
        dialogs handled.
        """
        handled = []
        deadline = time.time() + timeout
        while time.time() < deadline:
            # On the Android CN build the app explains each permission first;
            # its dialog has to be answered before the OS prompt is shown.
            if self.handle_rationale_dialog(action, timeout=1):
                handled.append('rationale')
                time.sleep(0.8)  # let the OS prompt come up
                continue
            if not self._os_alert_present():
                break
            if self._handle_permission(action, 2, accept_join=accept_join):
                handled.append('system_alert')
            elif self._handle_generic_permission_dialog(action):
                handled.append('generic')
            else:
                break
            time.sleep(0.8)  # let the next queued dialog appear
        if handled:
            logger.info("Permissions handled: %s", handled)
        return handled

    def drain_system_alerts(self, action='allow', overall_timeout=15, quiet_rounds=2, accept_join=False):
        """Proactively clear all queued permission dialogs (in-app purpose dialog first, then system) and return the count cleared."""
        deadline = time.time() + overall_timeout
        quiet = 0
        cleared = 0
        while time.time() < deadline and quiet < quiet_rounds:
            if self.handle_rationale_dialog(action, timeout=1):
                cleared += 1
                quiet = 0
                time.sleep(0.8)
                continue
            if self._os_alert_present(timeout=1):
                if self._handle_permission(action, 2, accept_join=accept_join):
                    cleared += 1
                quiet = 0
                time.sleep(0.8)
            else:
                quiet += 1
                time.sleep(0.6)
        if cleared:
            logger.info("Drained %d system alert(s) up front", cleared)
        return cleared

    def _handle_permission(self, action, timeout, accept_join=False):
        try:
            if self.platform == 'ios':
                return self._handle_ios_permission(action, timeout, accept_join=accept_join)
            return self._handle_android_permission(action, timeout)
        except Exception as error:
            logger.error("Error handling permission: %s", error)
            return False

    def _handle_ios_permission(self, action, timeout, accept_join=False):
        # WDA's native alert API is the most reliable.
        try:
            if action == "deny":
                self.driver.execute_script("mobile: alert", {"action": "dismiss"})
                logger.info("iOS permission deny via alert API")
                return True
            try:
                buttons = self.driver.execute_script("mobile: alert", {"action": "getButtons"}) or []
            except Exception:
                buttons = []
            # "Join Wi-Fi Network": accept only for SoftAP provisioning (accept_join); else cancel (Join strands the phone).
            if any("join" in str(b).lower() for b in buttons):
                if accept_join:
                    join_btn = next((str(b) for b in buttons if "join" in str(b).lower()), "Join")
                    self.driver.execute_script("mobile: alert", {"action": "accept", "buttonLabel": join_btn})
                    logger.info("iOS 'Join Wi-Fi Network' prompt ACCEPTED for provisioning (buttons: %s)", buttons)
                    return True
                self.driver.execute_script("mobile: alert", {"action": "dismiss", "buttonLabel": "Cancel"})
                logger.info("iOS 'Join Wi-Fi Network' prompt cancelled (buttons: %s)", buttons)
                return True
            if "Not Now" in buttons:
                self.driver.execute_script("mobile: alert", {"action": "dismiss", "buttonLabel": "Not Now"})
                logger.info("iOS system nag dismissed via 'Not Now' (buttons: %s)", buttons)
                return True
            preferred = ("Allow While Using App", "While Using App", "Allow Once", "Allow", "OK")
            choice = next((b for p in preferred for b in buttons if b == p), None)
            if not choice:
                logger.info("iOS alert is not a permission prompt; left untouched (buttons: %s)", buttons)
                return False
            self.driver.execute_script("mobile: alert", {"action": "accept", "buttonLabel": choice})
            logger.info("iOS permission allow - clicked '%s' (buttons: %s)", choice, buttons)
            return True
        except Exception:
            pass

        if action == 'deny':
            key_order = ['dont_allow_button', 'generic_deny']
        else:
            key_order = ['allow_while_using', 'allow_button', 'generic_allow']
        for key in key_order:
            if self._click_by_key(key, timeout):
                logger.info("iOS permission %s - clicked '%s'", action, key)
                return True
        logger.warning("iOS permission dialog not found or could not be handled")
        return False

    def _handle_android_permission(self, action, timeout):
        brand_allow = brand_deny = None
        if self.manufacturer == 'samsung':
            brand_allow, brand_deny = 'samsung_allow', 'samsung_deny'
        elif self.manufacturer == 'xiaomi':
            brand_allow, brand_deny = 'xiaomi_allow', 'xiaomi_deny'

        if action == 'deny':
            key_order = [brand_deny, 'deny_button', 'generic_deny']
        elif action == 'while_using':
            key_order = [brand_allow, 'while_using_button', 'allow_button', 'generic_allow']
        else:
            # 'allow': location/one-time dialogs have no plain "Allow"; fall back to the foreground-only button.
            key_order = [brand_allow, 'allow_button', 'while_using_button', 'generic_allow']

        for key in [k for k in key_order if k]:
            if self._click_by_key(key, timeout):
                logger.info("Android permission %s - clicked '%s'", action, key)
                return True
        logger.warning("Android permission dialog not found or could not be handled")
        return False

    def _handle_generic_permission_dialog(self, action, timeout=1):
        """Click a generic Allow/Deny button when no specific locator matched."""
        button_texts = ['Allow', 'OK', 'Continue'] if action == 'allow' else ['Deny', 'Cancel']
        for button_text in button_texts:
            locators = [
                ('xpath', f"//android.widget.Button[@text='{button_text}']"),
                ('xpath', f"//XCUIElementTypeButton[@name='{button_text}']"),
            ]
            for by_type, value in locators:
                try:
                    element = self.find_visible(by_type, value, timeout=timeout)
                    if element:
                        element.click()
                        logger.info("Generic permission dialog - clicked '%s'", button_text)
                        return True
                except Exception:
                    continue
        return False
