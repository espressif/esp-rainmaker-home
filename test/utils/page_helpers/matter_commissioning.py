# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Matter commissioning helper — drives the app Commissioning screen + the Google Play services half-sheet."""
import logging
import time

from .base import BasePage

logger = logging.getLogger(__name__)


class MatterCommissioning(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)

    def check_screen_displayed(self, timeout=15, poll=0.5, quiet=False, handle_alerts=True):
        return self.is_visible("app_commissioning_screen", timeout=timeout, poll=poll)

    def complete_commissioning(self, timeout=240, max_retries=2):
        """Drive the Google Play services half-sheet to a commissioned device; cap 'Try again' retries and surface the on-screen error on give-up."""
        deadline = time.time() + timeout
        retries = 0
        while time.time() < deadline:
            if self.is_visible("gps_device_connected_text", timeout=2):
                logger.info("Matter device connected; finishing Google Play services flow")
                self.click("gps_done_button", timeout=10)
                return True
            if self.is_visible("gps_ready_button", timeout=2):
                logger.info("Google Play services setup ready; starting discovery")
                self.click("gps_ready_button", timeout=5)
            elif self.is_visible("gps_try_again_button", timeout=2):
                if retries >= max_retries:
                    break
                retries += 1
                logger.info("Discovery not ready; retry %s/%s", retries, max_retries)
                self.click("gps_try_again_button", timeout=5)
            time.sleep(2)
        err = self.get_text("app_commissioning_error", timeout=2) or self.get_text("app_commissioning_status", timeout=2) or "no on-screen error"
        raise RuntimeError(f"Matter commissioning did not reach 'Device connected' (app: {err})")
