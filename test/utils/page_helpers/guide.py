# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Guide Page Helper
"""
import logging

from .base import BasePage

logger = logging.getLogger(__name__)


class Guide(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)

    def check_screen_displayed(self, timeout=5, **kwargs):
        """Check if the post-provision guide screen is displayed."""
        try:
            return self.is_visible("continue_button", timeout=timeout)
        except Exception as error:
            logger.warning(f"Guide screen not displayed: {error}")
            return False

    def tap_continue(self):
        """Tap Continue on the guide screen."""
        self.click("continue_button", timeout=5)
        return self
