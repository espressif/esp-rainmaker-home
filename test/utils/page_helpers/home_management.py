# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Home management page helper: the home banner dropdown, the Home Management list and a home's Settings screen."""

import time

from .base import BasePage


class HomeManagement(BasePage):
    def go_home_ready(self):
        """Reach the home screen, waiting for the footer to render first so go_home's back-press loop never exits the app on a slow post-login home."""
        home = self.get_other_page_helper("home")
        home.is_visible("home_tab_button", timeout=10)
        home.go_home()
        return home

    def open_home_management(self):
        """Home -> banner dropdown -> Home Management."""
        self.go_home_ready()
        self.click("home_banner_dropdown", timeout=5)
        self.click("home_management_option", timeout=5)
        return self

    def open_home_settings(self, home_name):
        """Open a home's Settings from the Home Management list; each row carries its own `button_<home name>` id and the screen push can lag well behind the tap."""
        self.open_home_management()
        self.click("id", f"button_{home_name}", timeout=25)
        return self

    def select_home(self, home_name):
        """Switch the active home from the banner dropdown."""
        self.go_home_ready()
        self.click("home_banner_dropdown", timeout=5)
        self.click("id", f"button_dropdown_{home_name}", timeout=5)
        time.sleep(1)
        return self

    def rename_home(self, new_name):
        """Rename the home from its Settings screen; the app saves on blur/submit, so commit explicitly and confirm the name persisted."""
        self.click("edit_home_name_button", timeout=5)
        self.send_keys("home_name_input", new_name, clear_first=True, timeout=5)
        if self.platform != "ios":
            self.driver.press_keycode(66)
            self.hide_keyboard_if_visible()
        else:
            self.click("home_name_input", timeout=3)
        deadline = time.time() + 10
        current = ""
        while time.time() < deadline:
            current = (self.get_text("home_name_input", timeout=2) or "").strip()
            if current == new_name:
                return self
            time.sleep(1)
        raise AssertionError(f"Home rename did not persist: field shows '{current}', wanted '{new_name}'")

    def assert_leave_home_available(self):
        assert self.is_visible("leave_home_button", timeout=5), "Leave Home option is not available for a secondary user"
        return self
