# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Add To Room Page Helper
"""
import logging

from .base import BasePage

logger = logging.getLogger(__name__)


class AddToRoom(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)


    def select_existing_room(self, room_name: str):
        """Select an existing room by its visible name."""
        logger.info("Selecting existing room: %s", room_name)
        for label in self.find_all("room_names_list_text"):
            if (label.text or "").strip() == room_name and label.is_displayed():
                label.click()
                self.last_selected_room = room_name
                return self
        raise Exception(f"Room '{room_name}' not found on add to room screen")

    def tap_continue(self):
        """Tap Continue on the add to room screen."""
        self.click("continue_button", timeout=2)
        return self

    def validate_screen_elements(self):
        """Validate expected elements on the add to room screen."""
        logger.info("Validating add to room screen elements")

        required_elements = [
            "title",
            "back_button",
            "continue_button",
            "skip_button",
            "text_create_new_room",
            "button_create_new_room",
        ]

        missing_elements = []
        for element in required_elements:
            if not self.is_visible(element, timeout=5):
                missing_elements.append(element)

        if missing_elements:
            raise Exception(f"Missing add to room screen elements: {missing_elements}")

        logger.info("Add to room screen elements validated successfully")
        return True

    def skip(self):
        """Skip the add to room screen."""
        self.click("skip_button")
        logger.info("Add to room skipped")
        return self
