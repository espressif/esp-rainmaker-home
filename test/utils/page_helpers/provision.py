# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Provision Page Helper
"""
import logging
import time

from .base import BasePage

logger = logging.getLogger(__name__)


class Provision(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)
        self._success_toast_title = None


    def assert_all_steps_successful(self, timeout=75):
        """Assert each provisioning step shows a success icon and Continue is enabled.

        Polls and returns as soon as all steps pass; the higher ceiling covers
        SoftAP/cloud association round-trips that run longer than BLE.
        """
        
        # Fresh capture each call so a second provisioning in the same scenario
        # cannot read the previous device's stashed toast.
        self._success_toast_title = None
        end_time = time.monotonic() + timeout
        while time.monotonic() < end_time:
            if self.is_visible("failed_icon", timeout=1):
                error_text = None
                if self.is_visible("provisioning_error_text", timeout=1):
                    error_text = self.get_text("provisioning_error_text")
                raise Exception(f"Provisioning step failed: {error_text or 'unknown error'}")

            # Poll for the success toast every iteration: it fires the instant the
            # last step passes and fades within seconds, so a fast suite (scan-QR,
            # 3 steps) can finish before a coarse all-steps poll notices it. Only
            # stash the provisioning-success toast so an intermediate toast can't
            # be mistaken for it.
            if self._success_toast_title is None:
                title, _ = self.get_toast_title_and_message(timeout=1, require_message=False)
                if title and "provision" in title.lower():
                    self._success_toast_title = title

            step_descriptions = self.find_all("provisioning_step_description_text")
            success_icons = self.find_all("success_icon")
            step_count = len(step_descriptions)

            if step_count > 0 and len(success_icons) == step_count:
                # All steps just passed — the success toast is firing right now
                # and fades within a few seconds, so poll tightly for it here
                # (the per-iteration capture above can straddle its lifetime).
                if self._success_toast_title is None:
                    toast_deadline = time.monotonic() + 6
                    while self._success_toast_title is None and time.monotonic() < toast_deadline:
                        title, _ = self.get_toast_title_and_message(timeout=1, require_message=False)
                        if title and "provision" in title.lower():
                            self._success_toast_title = title
                if self.is_enabled("continue_button", timeout=2):
                    logger.info("All %s provisioning steps completed successfully", step_count)
                    return True

            time.sleep(0.5)


        step_descriptions = self.find_all("provisioning_step_description_text")
        success_icons = self.find_all("success_icon")
        raise TimeoutError(
            "Provisioning steps did not all succeed within "
            f"{timeout}s (steps={len(step_descriptions)}, "
            f"success_icons={len(success_icons)})"
        )

    def assert_success_toast(self, expected_title="Device provisioned successfully", timeout=10):
        """
        Assert the 'Device provisioned successfully' toast is shown.

        The toast is transient (fires from useProvision the moment all steps
        pass), so call this right after assert_all_steps_successful.
        """
        # Prefer the toast captured during assert_all_steps_successful (it is
        # transient); fall back to a fresh read if still on screen.
        title = self._success_toast_title
        if title is None:
            title, _ = self.get_toast_title_and_message(timeout=timeout, require_message=False)
        if title is None:
            raise AssertionError(
                f"Success toast not shown (expected title '{expected_title}')"
            )
        if expected_title not in title:
            raise AssertionError(
                f"Unexpected toast title: got '{title}', expected '{expected_title}'"
            )
        logger.info("Provisioning success toast verified: '%s'", title)
        return True

    def tap_continue(self):
        """Tap Continue after provisioning completes."""
        self.click("continue_button", timeout=10)
        return self

    def validate_screen_elements(self):
        """Validate expected elements on the provision progress screen."""
        logger.info("Validating provision screen elements")

        required_elements = [
            "title",
            "back_button",
            "continue_button",
        ]

        missing_elements = []
        for element in required_elements:
            if not self.is_visible(element, timeout=5):
                missing_elements.append(element)

        if missing_elements:
            raise Exception(f"Missing provision screen elements: {missing_elements}")

        logger.info("Provision screen elements validated successfully")
        return True
