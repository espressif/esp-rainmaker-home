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

    def connect_to_device(self, device_name: str = None, timeout=45):
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
        for _ in range(30):
            if pop.check_screen_displayed(timeout=1, quiet=True) or \
               connect_wifi.check_screen_displayed(timeout=1, quiet=True):
                return True
            time.sleep(1)
        logger.warning("Neither PoP nor Connect Wi-Fi screen appeared within ~60s of SoftAP connect")
        return False

    def _android_connect(self, device_name, timeout):
        """Android: pick the device card, tap Connect, accept the OS join dialog."""
        if not self.is_visible("device_card", timeout=timeout):
            raise RuntimeError("No SoftAP devices discovered within timeout")
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

        # Joining the device's temporary Wi-Fi raises a WifiNetworkSpecifier
        # "Connect to device?" dialog (android:id/button1).
        if self.is_visible("system_join_connect", timeout=8):
            logger.info("Accepting OS join-network dialog")
            self.click("system_join_connect")
        else:
            self.get_other_page_helper("permissions").handle_all_permissions(action="allow", timeout=4)

    def _ios_connect_via_settings(self, device_name):
        """
        iOS SoftAP connect.

        The app reads the joined SSID via CNCopyCurrentNetworkInfo, which only
        returns a value once Location is granted — otherwise the app can't target
        the join and the Connect button can't advance. So we grant Location, join
        the PROV_xxxx hotspot (the app opens Wi-Fi Settings since iOS blocks
        programmatic join), return, tap Connect again, and accept the system
        "Join Wi-Fi Network" alert the app raises via NEHotspotConfiguration
        (the same native dialog Android shows).
        """
        if not device_name:
            raise RuntimeError("iOS SoftAP join needs the device SSID from the serial payload")
        perms = self.get_other_page_helper("permissions")
        bundle_id = self.driver.capabilities.get("bundleId", "com.espressif.nova")

        logger.info("Tapping Connect on iOS SoftAP screen")
        self.click("connect_button", timeout=10)
        # Grant the Location prompt so the app can read the current Wi-Fi SSID.
        perms.handle_all_permissions(action="allow", timeout=5)

        # Not on the device hotspot yet → the app opens Wi-Fi Settings; join there.
        if self._ios_join_wifi_in_settings(device_name):
            logger.info("Returning to app %s after joining %s", bundle_id, device_name)
            self.driver.activate_app(bundle_id)
            if self.is_visible("connect_button", timeout=10):
                self.click("connect_button")

        # Now on PROV_: the app re-applies the SSID via NEHotspotConfiguration,
        # raising the system "Join Wi-Fi Network" alert. Accept any Location/Join
        # alerts and stop as soon as the app advances to the next screen (PoP or
        # Connect-Wi-Fi), so we don't burn a fixed delay on the happy path.
        pop = self.get_other_page_helper("pop")
        connect_wifi = self.get_other_page_helper("connect_wifi")
        for _ in range(15):
            if perms.any_system_alert_present(timeout=1):
                perms.handle_all_permissions(action="allow", timeout=3)
            if pop.check_screen_displayed(timeout=1, quiet=True) or \
               connect_wifi.check_screen_displayed(timeout=1, quiet=True):
                break
            time.sleep(1)

    def _ios_join_wifi_in_settings(self, ssid, timeout=90):
        """
        Drive the iOS Settings app to join the open PROV_xxxx network.

        openWifiSettings() lands on the app's own Settings page (Apple
        deprecated third-party Wi-Fi deep-links), so navigate up to root
        Settings, into Wi-Fi, then tap the network.
        """
        def _tap(predicate):
            try:
                self.driver.find_element("-ios predicate string", predicate).click()
                return True
            except Exception:
                return False

        deadline = time.time() + timeout
        while time.time() < deadline:
            # 1. The network cell is visible (we're on the Wi-Fi list) → join it.
            if _tap(f"name == '{ssid}' OR label == '{ssid}'"):
                logger.info("Tapped '%s' in iOS Wi-Fi Settings", ssid)
                time.sleep(6)  # allow the open-network join to settle
                # Dismiss a possible "no internet connection" confirmation.
                self.get_other_page_helper("permissions").handle_all_permissions(action="allow", timeout=2)
                return True
            # 2. On root Settings → step into Wi-Fi.
            if _tap("name == 'Wi-Fi' OR label == 'Wi-Fi' OR name == 'WLAN'"):
                time.sleep(2)
                continue
            # 3. On the app's settings sub-page → tap the nav-bar back button
            #    (its name varies, so target it by position via a class chain).
            try:
                self.driver.find_element(
                    "-ios class chain",
                    "**/XCUIElementTypeNavigationBar/XCUIElementTypeButton[1]",
                ).click()
            except Exception:
                pass
            time.sleep(1.5)
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
