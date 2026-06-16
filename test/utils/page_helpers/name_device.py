# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Name Device Page Helper
"""
import logging

from .base import BasePage

logger = logging.getLogger(__name__)


class NameDevice(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)


    def rename_device(self, device_name: str):
        """Replace the default device name with a new value."""
        logger.info("Renaming device to: %s", device_name)
        self.send_keys("device_name_input", device_name, clear_first=True)
        self.hide_keyboard_if_visible()
        self.last_device_name = device_name
        return self

    def tap_continue(self):
        """Tap Continue on the name device screen."""
        self.click("continue_button", timeout=2)
        return self

    def validate_screen_elements(self):
        """Validate expected elements on the name device screen."""
        logger.info("Validating name device screen elements")

        required_elements = [
            "title",
            "back_button",
            "continue_button",
            "skip_button",
            "device_name_input",
        ]

        missing_elements = []
        for element in required_elements:
            if not self.is_visible(element, timeout=5):
                missing_elements.append(element)

        if missing_elements:
            raise Exception(f"Missing name device screen elements: {missing_elements}")

        logger.info("Name device screen elements validated successfully")
        return True
