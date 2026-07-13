# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Add Device Selection Page Helper
"""
import logging

from .base import BasePage

logger = logging.getLogger(__name__)


class AddDevice(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)


    def open_from_home(self):
        """Tap Add Device on the home screen."""
        home_page = self.get_other_page_helper("home")
        perms = self.get_other_page_helper("permissions")
        if perms.any_system_alert_present(timeout=1):
            perms.handle_all_permissions(action="allow", timeout=3)
        if not home_page.check_screen_displayed(timeout=5):
            raise Exception("Home screen is not displayed")
        home_page.open_add_device()
        return self

    def select_scan_qr_option(self):
        """Select the Scan QR Code provisioning option."""
        self.click("qr_code_option", timeout=10)
        return self

    def select_bluetooth_option(self):
        """Select the Bluetooth provisioning option."""
        self.click("bluetooth_option", timeout=10)
        return self

    def select_soft_ap_option(self):
        """Select the SoftAP provisioning option."""
        self.click("soft_ap_option", timeout=10)
        return self

    def select_on_network_option(self):
        """Select the On Network provisioning option."""
        self.click("on_network_option", timeout=10)
        return self

    def validate_screen_elements(self):
        """Validate expected elements on the Add Device selection screen."""
        logger.info("Validating add device selection screen elements")

        required_elements = [
            "title",
            "text_add_device_selection_note",
            "qr_code_option",
            "bluetooth_option",
            "soft_ap_option",
        ]

        missing_elements = []
        for element in required_elements:
            if not self.is_visible(element, timeout=5):
                missing_elements.append(element)

        if self.is_visible("on_network_option", timeout=2):
            logger.info("Optional element present: on_network_option")

        if missing_elements:
            raise Exception(f"Missing add device selection elements: {missing_elements}")

        logger.info("All add device selection screen elements validated successfully")
        return True
