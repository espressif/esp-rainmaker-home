# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Scan QR Page Helper
"""
import logging
import time

from .base import BasePage

logger = logging.getLogger(__name__)

_SCANNER_LOCATORS = (
    "view_scanner_overlay",
    "align_qr_text",
    "camera_toggle_button",
)

_PERMISSION_LOCATORS = (
    "button_permission",
    "permission_title_scan_qr_text",
    "permission_msg_scan_qr_text",
    "permission_msg_ble_scan_qr_text",
)


class ScanQr(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)


    def is_scanner_visible(self, timeout=1):
        """Return True when the QR scanner overlay is visible."""
        for locator in _SCANNER_LOCATORS:
            if self.is_visible(locator, timeout=timeout):
                return True
        return False

    def open_add_device_selection(self):
        """Tap 'no QR code' to reach the Bluetooth/SoftAP/On Network list, which this screen now gates."""
        self.grant_runtime_permissions_if_needed()
        self.click("no_qr_code_button", timeout=10)
        return self

    def is_permission_prompt_visible(self, timeout=0.5):
        """Return True when an in-app camera or BLE permission prompt is shown."""
        for locator in _PERMISSION_LOCATORS:
            if self.is_visible(locator, timeout=timeout):
                return True
        return False

    def grant_runtime_permissions_if_needed(self, max_rounds=6):
        """
        Clear the camera/BLE/location permission gate so the scanner activates.

        Handles both forms in one loop: the app's in-app permission prompt
        (tap button_permission) and the sequence of OS system dialogs
        (camera → location → nearby devices), since on Android they appear one
        after another and iOS shows them as native alerts.
        """
        if self.is_scanner_visible(timeout=0.5):
            logger.info("Scanner already open; skipping permission handling")
            return self

        permissions_page = self.get_other_page_helper("permissions")
        idle_rounds = 0
        for _ in range(max_rounds):
            if self.is_scanner_visible(timeout=0.5):
                return self

            acted = False

            # App's own in-app prompt screen → tap its grant button.
            if self.is_visible("button_permission", timeout=0.5):
                self.click("button_permission")
                acted = True

            # OS system dialog(s) — handle_all_permissions clears the whole
            # queued sequence (camera, location, nearby devices).
            if permissions_page.handle_all_permissions(action="allow", timeout=4):
                acted = True

            if acted:
                idle_rounds = 0
                continue

            idle_rounds += 1
            if idle_rounds >= 2:
                break
            time.sleep(1.5)

        if not self.is_scanner_visible(timeout=2) and self.is_permission_prompt_visible(timeout=0.5):
            raise RuntimeError("Scanner not available; permissions still blocked")

        return self


    def wait_for_scan_processing_to_finish(self, timeout=10):
        """Wait for the post-scan loading indicator to disappear if it appears."""
        if not self.is_visible("scan_processing_indicator", timeout=timeout):
            return self

        logger.info("QR scan processing started; waiting for completion")
        self.wait_for_element_to_disappear("scan_processing_indicator", timeout=timeout)
        return self
        

    def perform_qr_scan(self, scan_timeout=15):
        """
        Complete QR scan flow: open scanner if needed, trigger ESP QR.

        @param scan_timeout - Seconds to wait for post-scan navigation
        """
        logger.info("Performing QR scan flow")

        if not self.check_screen_displayed(timeout=2):
            raise RuntimeError("Not on Scan QR screen")

        self.grant_runtime_permissions_if_needed()

        # The camera/scanner overlay needs a moment to initialise after the
        # permission grant (notably on iOS).
        if not self.is_scanner_visible(timeout=5):
            if not self.check_screen_displayed(timeout=2):
                logger.info("Scanner already consumed the displayed QR; continuing past scan")
                return self
            raise RuntimeError("QR scanner is not available")

        return self.wait_for_scan_processing_to_finish(timeout=scan_timeout)

    def validate_baseline_elements(self):
        """Validate locators that are always present on the Scan QR screen shell."""
        logger.info("Validating Scan QR baseline elements")

        required_elements = [
            "title",
        ]

        missing_elements = []
        for element in required_elements:
            if not self.is_visible(element, timeout=5):
                missing_elements.append(element)

        if missing_elements:
            raise Exception(f"Missing Scan QR baseline elements: {missing_elements}")

        logger.info("Scan QR baseline elements validated successfully")
        return True

    def validate_scanner_elements(self):
        """Validate scanner overlay controls when the camera is active."""
        logger.info("Validating Scan QR scanner elements")

        missing_elements = []
        for element in _SCANNER_LOCATORS:
            if not self.is_visible(element, timeout=5):
                missing_elements.append(element)

        if missing_elements:
            raise Exception(f"Missing Scan QR scanner elements: {missing_elements}")

        logger.info("Scan QR scanner elements validated successfully")
        return True
