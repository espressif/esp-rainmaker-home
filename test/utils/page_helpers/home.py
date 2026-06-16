# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Home Page Helper
"""
import logging
import time

from .base import BasePage

logger = logging.getLogger(__name__)


class Home(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)

    def handle_nickname_popup(self, action: str = "skip", nickname: str = None):
        """
        Handle the nickname pop-up that appears after signup.

        @param action - Action to perform on the pop-up ("skip" or "add")
        @param nickname - Nickname to add if action is "add"
        @returns self
        """
        logger.info(f"Attempting to handle nickname pop-up with action: {action} and nickname: {nickname}")

        if action == "skip":
            element = self.find_visible("nickname_skip_button", timeout=5)
            if element:
                element.click()
                logger.info("Clicked nickname skip button")
            else:
                logger.warning("Nickname skip button not found")
        elif action == "add":
            self.send_keys("nickname_input", nickname, timeout=5)
            self.click("nickname_add_button", timeout=2)
        else:
            raise ValueError(f"Invalid action: {action}")
        return self

    def open_add_device(self):
        """
        Tap Add Device on home — header button when devices exist,
        or empty-state banner button when no devices are provisioned yet.
        """
        if self.is_visible("add_device_button", timeout=2):
            self.click("add_device_button")
        elif self.is_visible("add_device_banner_button", timeout=2):
            logger.info("Using empty-state banner add device button")
            self.click("add_device_banner_button")
        else:
            raise Exception("Add device entry point not found on home screen")
        return self

    def is_device_visible(self, device_name: str, timeout=10):
        """
        Check whether a provisioned device name is visible on the home screen.

        @param device_name - Expected device display name
        @param timeout - Seconds to poll for the device card
        @returns True when the device name is visible
        """
        logger.info("Checking device visibility on home: %s", device_name)
        end_time = time.monotonic() + timeout

        while time.monotonic() < end_time:
            for label in self.find_all("device_names_text"):
                if (label.text or "").strip() == device_name and label.is_displayed():
                    logger.info("Device '%s' is visible on home screen", device_name)
                    return True
            time.sleep(0.5)

        logger.warning(
            "Device '%s' not visible on home screen within %ss",
            device_name,
            timeout,
        )
        return False
