# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Scan Bluetooth Devices Page Helper
"""
import logging

from .base import BasePage

logger = logging.getLogger(__name__)


class ScanBle(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)


    def grant_runtime_permissions_if_needed(self):
        """Grant Bluetooth/location permissions when the in-app prompt is shown."""
        if self.is_visible("button_permission", timeout=1):
            logger.info("BLE permission prompt detected; granting permissions")
            self.click("button_permission")
            permissions_page = self.get_other_page_helper("permissions")
            permissions_page.handle_all_permissions(action="allow", timeout=6)
        return self

    def _click_rescan_if_present(self):
        """Tap the BLE rescan control, whichever state is shown: populated list
        (button_rescan_ble) or the empty 'No devices found' card (button_rescan)."""
        if self.is_visible("rescan_button", timeout=3):
            self.click("rescan_button")
            return True
        if self.is_visible("rescan_button_empty", timeout=2):
            self.click("rescan_button_empty")
            return True
        return False

    def select_device(self, device_name: str = None, timeout=30, max_passes: int = 3):
        """
        Select a discovered BLE device by its advertised name; if the target is not
        yet listed, tap Rescan and retry (BLE advertising can be slow to surface).

        @param device_name - Device name from the provisioning payload
                             (e.g. PROV_xxxxxx); first device when None.
        """
        self.grant_runtime_permissions_if_needed()
        per_pass = timeout
        for pass_num in range(1, max_passes + 1):
            self.is_visible("device_card", timeout=per_pass)
            if device_name:
                for label in self.find_all("device_name_text"):
                    if (label.text or "").strip() == device_name and label.is_displayed():
                        logger.info("Selecting BLE device: %s", device_name)
                        label.click()
                        return self
            elif self.is_visible("device_card", timeout=2):
                logger.info("Selecting first discovered BLE device")
                self.click("device_card", timeout=5)
                return self
            if pass_num < max_passes:
                if self._click_rescan_if_present():
                    logger.info("BLE target '%s' absent on pass %s/%s; rescanning", device_name, pass_num, max_passes)
                else:
                    logger.warning("BLE target '%s' absent on pass %s; no rescan control, waiting", device_name, pass_num)
                per_pass = 10
        raise RuntimeError(f"BLE device '{device_name}' not found in scan results after {max_passes} passes")

    def validate_screen_elements(self):
        """Validate expected elements on the Scan BLE screen."""
        logger.info("Validating Scan BLE screen elements")

        required_elements = [
            "title",
        ]

        missing_elements = []
        for element in required_elements:
            if not self.is_visible(element, timeout=5):
                missing_elements.append(element)

        if missing_elements:
            raise Exception(f"Missing Scan BLE screen elements: {missing_elements}")

        logger.info("Scan BLE screen elements validated successfully")
        return True
