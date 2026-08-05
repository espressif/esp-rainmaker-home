# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Claiming Page Helper — the assisted-claiming step between PoP/QR and Connect to Wi-Fi."""
import logging
import time

from .base import BasePage

logger = logging.getLogger(__name__)

CLAIM_TIMEOUT = 30


class Claiming(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)

    def is_displayed(self, timeout=2):
        """True while the app is claiming the node (CSR exchange with the deployment)."""
        return self.check_screen_displayed(timeout=timeout, quiet=True)

    def progress_message(self):
        """Latest claim progress line, for diagnostics when the step stalls."""
        try:
            return self.get_text("progress", timeout=1)
        except Exception:
            return ""

    def wait_until_finished(self, timeout=CLAIM_TIMEOUT, poll=1.0):
        """Block until the claiming screen clears; raises with the app's own error text on failure."""
        if not self.is_displayed():
            return True

        logger.info("Claiming screen shown ('%s'); waiting up to %ss", self.progress_message(), timeout)
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.is_visible("error", timeout=0.5):
                raise RuntimeError(f"Assisted claiming failed on device: {self.get_text('error', timeout=2)}")
            if not self.is_displayed(timeout=0.5):
                logger.info("Assisted claiming finished")
                return True
            time.sleep(poll)

        raise RuntimeError(
            f"Claiming screen did not clear within {timeout}s (last progress: '{self.progress_message()}')")
