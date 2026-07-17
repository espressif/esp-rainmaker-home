# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Manual Matter commissioning helper — drives the in-app pairing-code entry screen."""
import logging

from .base import BasePage

logger = logging.getLogger(__name__)


class MatterManual(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)

    def check_screen_displayed(self, timeout=15, poll=0.5):
        return self.is_visible("pairing_code_input", timeout=timeout, poll=poll)

    def enter_pairing_code(self, pairing_code: str):
        """Type the Matter manual pairing code and continue into commissioning."""
        logger.info("Entering Matter manual pairing code")
        self.send_keys("pairing_code_input", pairing_code)
        self.click("continue_button", timeout=10)
        return self

    def validate_screen_elements(self):
        """Validate expected elements on the manual pairing-code screen."""
        logger.info("Validating Matter manual commissioning screen elements")

        required_elements = [
            "heading",
            "pairing_code_input",
            "continue_button",
        ]

        missing_elements = [
            element
            for element in required_elements
            if not self.is_visible(element, timeout=5)
        ]

        if missing_elements:
            raise Exception(
                f"Missing Matter manual commissioning elements: {missing_elements}"
            )

        logger.info("Matter manual commissioning screen elements validated successfully")
        return True
