# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
On Network Discover Devices Page Helper
"""
import logging

from .base import BasePage

logger = logging.getLogger(__name__)


class OnNetwork(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)


    def wait_for_devices(self, per_pass_timeout=15, max_passes=3):
        """Wait for an on-network device card, re-scanning when none is found."""
        logger.info("Waiting for on-network discovery results (up to %s passes)", max_passes)
        perms = self.get_other_page_helper("permissions")
        for pass_num in range(1, max_passes + 1):
            if perms.any_system_alert_present(timeout=1):
                perms.handle_all_permissions(action="allow", timeout=3)
            if self.is_visible("device_card", timeout=per_pass_timeout):
                logger.info("On-network device discovered on pass %s/%s", pass_num, max_passes)
                return self
            if pass_num >= max_passes:
                break
            if self.is_visible("rescan_button", timeout=5):
                logger.info("No device on pass %s/%s; tapping Rescan to re-browse mDNS", pass_num, max_passes)
                self.click("rescan_button")
            else:
                logger.warning("No device and no Rescan control visible on pass %s; waiting again", pass_num)
        raise RuntimeError(f"No on-network devices discovered after {max_passes} discovery passes")

    def is_pop_required(self, timeout=2) -> bool:
        """Return True when the discovered device shows the POP Required badge."""
        return self.is_visible("pop_badge_text", timeout=timeout)

    def select_first_device(self):
        """Select the first discovered on-network device (re-scanning as needed)."""
        self.wait_for_devices()
        logger.info("Selecting first discovered on-network device")
        self.click("device_card", timeout=5)
        return self

    def select_device_by_node_id(self, node_id):
        """Select the discovered card whose node id matches, so a parallel run's other node is never picked."""
        id_by = self.get_element_locator("node_id_text")
        for _ in range(3):
            self.wait_for_devices()
            for card in self.find_all("device_card"):
                try:
                    nid = (card.find_element(*id_by).text or "").strip()
                    if nid and node_id and (node_id in nid or nid in node_id):
                        card.click()
                        return self
                except Exception:
                    continue
        raise RuntimeError(f"On-network device with node id '{node_id}' not discovered")

    def validate_screen_elements(self):
        """Validate expected elements on the Discover Devices screen."""
        logger.info("Validating on-network discovery screen elements")

        required_elements = [
            "title",
        ]

        missing_elements = []
        for element in required_elements:
            if not self.is_visible(element, timeout=5):
                missing_elements.append(element)

        if missing_elements:
            raise Exception(f"Missing on-network discovery elements: {missing_elements}")

        logger.info("On-network discovery screen elements validated successfully")
        return True
