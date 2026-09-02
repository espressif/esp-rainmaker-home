# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Proof of Possession Page Helper
"""
import logging

from .base import BasePage

logger = logging.getLogger(__name__)


class Pop(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)


    def enter_pop(self, pop_code: str):
        """Enter the proof of possession code and connect (empty = no-PoP build); clear first — a rejected code stays in the field on re-entry."""
        if pop_code:
            logger.info("Entering proof of possession code")
            self.send_keys("pop_input", pop_code, clear_first=True)
        else:
            logger.info("No PoP for this device; submitting the screen empty")
        self.click("verify_button", timeout=10)
        return self

    def validate_screen_elements(self):
        """Validate expected elements on the PoP screen."""
        logger.info("Validating PoP screen elements")

        required_elements = [
            "title",
            "pop_input",
            "verify_button",
        ]

        missing_elements = []
        for element in required_elements:
            if not self.is_visible(element, timeout=5):
                missing_elements.append(element)

        if missing_elements:
            raise Exception(f"Missing PoP screen elements: {missing_elements}")

        logger.info("PoP screen elements validated successfully")
        return True
