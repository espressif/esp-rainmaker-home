# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Reset Password Page Helper
"""
import logging
from .base import BasePage

logger = logging.getLogger(__name__)


class ResetPassword(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)

    def get_title_text(self):
        """Title of the reset toast; the send request can stay in flight for several seconds, so wait out the spinner before giving up."""
        try:
            return self.get_text("title_text", timeout=10)
        except Exception:
            return None
