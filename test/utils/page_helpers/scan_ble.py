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

    def wait_for_devices(self, timeout=30):
        """Wait until at least one BLE device card is listed."""
        logger.info("Waiting for BLE scan results")
        if self.is_visible("device_card", timeout=timeout):
            return self
        raise RuntimeError("No BLE devices discovered within timeout")

    def select_device(self, device_name: str = None, timeout=30):
        """
        Select a discovered BLE device by its advertised name.

        @param device_name - Device name from the provisioning payload
                             (e.g. PROV_xxxxxx); first device when None.
        """
        self.grant_runtime_permissions_if_needed()
        self.wait_for_devices(timeout=timeout)

        if device_name:
            for label in self.find_all("device_name_text"):
                if (label.text or "").strip() == device_name and label.is_displayed():
                    logger.info("Selecting BLE device: %s", device_name)
                    label.click()
                    return self
            raise RuntimeError(f"BLE device '{device_name}' not found in scan results")

        logger.info("Selecting first discovered BLE device")
        self.click("device_card", timeout=5)
        return self

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
