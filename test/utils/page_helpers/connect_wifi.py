# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Connect Wi-Fi Page Helper."""
import logging

from .base import BasePage

logger = logging.getLogger(__name__)


class ConnectWifi(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)

    def check_screen_displayed(self, timeout=10, wait_for_network_load=True, **kwargs):
        """Check if the Connect to Wi-Fi screen is displayed."""
        try:
            if super().check_screen_displayed(timeout, **kwargs):
                if wait_for_network_load:
                    self.wait_for_network_selection_loading_to_finish()
                return True
            return self.is_wifi_list_modal_visible(timeout=2)
        except Exception as error:
            logger.warning(f"Connect Wi-Fi screen not displayed: {error}")
            return False


    def wait_for_network_selection_loading_to_finish(self, timeout=10):
        """Wait for the network picker loading spinner to disappear."""
        if not self.is_visible("network_selection_loading", timeout=2):
            logger.info("Select Wi-Fi loading spinner not visible")
            return self

        logger.info("Waiting for Wi-Fi network list to finish loading")
        if not self.wait_for_element_to_disappear("network_selection_loading", timeout=timeout):
            raise RuntimeError("Wi-Fi network selection loading did not finish in time")
        return self

    def is_wifi_list_modal_visible(self, timeout=2):
        """Return True when the available Wi-Fi networks bottom sheet is open."""
        return self.is_visible("network_modal_title", timeout=timeout)

    def dismiss_wifi_list_modal(self):
        """Close the available Wi-Fi list modal if it is blocking the main screen."""
        if not self.is_wifi_list_modal_visible(timeout=3):
            logger.info("Available Wi-Fi list modal not visible")
            return self

        logger.info("Dismissing available Wi-Fi list modal")

        if self.platform == "android":
            try:
                self.driver.press_keycode(4)
                logger.info("Sent Android back to dismiss Wi-Fi list modal")
            except Exception as error:
                logger.warning("Android back dismiss failed: %s", error)

        if self.is_wifi_list_modal_visible(timeout=1):
            logger.info("Trying backdrop tap to dismiss Wi-Fi list modal")
            self._tap_wifi_list_modal_backdrop()

        # Best-effort: don't fail here (the caller's next action confirms the screen is usable).
        if not self.wait_for_element_to_disappear("network_modal_title", timeout=5):
            logger.warning("Available Wi-Fi list modal still detected; continuing")

        return self

    def _tap_wifi_list_modal_backdrop(self):
        """Tap the dimmed area above the bottom sheet."""
        try:
            self.click("close_wifi_modal_button", timeout=2)

            return
        except Exception:
            pass

        size = self.driver.get_window_size()
        x = size["width"] // 2
        y = int(size["height"] * 0.15)
        self.driver.tap([(x, y)])

    def open_join_other_network_modal(self):
        """Dismiss Wi-Fi list if open, then open Join Other Network."""
        self.dismiss_wifi_list_modal()
        self.click("button_join_other_network_wifi", timeout=5)
        return self

    def enter_join_network_credentials(self, ssid: str, password: str):
        """Enter SSID and password in the Join Other Network modal."""
        self.send_keys("ssid_join_network_wifi", ssid)
        if password:
            self.send_keys("password_join_network_wifi", password)
        return self

    def connect_join_network(self):
        """Tap Connect in the Join Other Network modal."""
        self.click("connect_join_network_wifi_button", timeout=2)
        return self

    def validate_screen_elements(self):
        """Validate expected elements on the Connect to Wi-Fi screen."""
        logger.info("Validating connect Wi-Fi screen elements")

        required_elements = [
            "title",
            "select_network_button",
            "text_selected_wifi",
            "wifi_password_input",
            "password_toggle_wifi",
            "checkbox_save_network_wifi",
            "text_save_network_wifi",
            "button_connect_wifi",
            "button_join_other_network_wifi",
        ]

        missing_elements = []
        for element in required_elements:
            if not self.is_visible(element, timeout=5):
                missing_elements.append(element)

        if missing_elements:
            raise Exception(f"Missing connect Wi-Fi screen elements: {missing_elements}")

        logger.info("Connect Wi-Fi screen elements validated successfully")
        return True
