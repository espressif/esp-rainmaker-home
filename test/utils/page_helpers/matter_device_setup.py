# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Matter Device Setup Page Helper

The name step the app shows after Matter commissioning. It looks like the
Wi-Fi "Name your device" screen (same title and name box) but has its own
Continue / Skip ids and an Identify button.
"""
import logging
import time

from .base import BasePage

logger = logging.getLogger(__name__)


class MatterDeviceSetup(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)

    def check_screen_displayed(self, timeout=5, poll=0.5, quiet=False, handle_alerts=True):
        """True when the Matter setup screen (not the Wi-Fi name screen) is shown."""
        return self.is_visible("screen", timeout=timeout, poll=poll)

    def tap_continue(self, timeout=30):
        """Tap Continue on the Matter setup screen; it saves the name, then opens the room step."""
        self.click("continue_button", timeout=5)
        # Saving the name (over Matter and to the cloud) can take a few seconds.
        deadline = time.time() + timeout
        while time.time() < deadline and self.is_visible("screen", timeout=1):
            time.sleep(1)
        return self

    def skip(self):
        """Skip the name step and go to the room step."""
        self.click("skip_button", timeout=5)
        logger.info("Matter device setup skipped")
        return self

    def validate_screen_elements(self):
        """Validate expected elements on the Matter setup screen (Identify shows only for devices that support it)."""
        logger.info("Validating Matter device setup screen elements")
        required_elements = ["title", "device_name_input", "continue_button", "skip_button"]
        missing_elements = [element for element in required_elements if not self.is_visible(element, timeout=5)]
        if missing_elements:
            raise Exception(f"Missing Matter device setup screen elements: {missing_elements}")
        logger.info("Matter device setup screen elements validated successfully")
        return True
