# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Group sharing page helper: rename/select a home, share it, accept invitations, and revoke."""

import time

from selenium.common.exceptions import StaleElementReferenceException

from .base import BasePage


class GroupSharing(BasePage):
    def _home_management(self):
        return self.get_other_page_helper("home_management")

    def relogin(self, email, password):
        """Switch accounts in-suite: log out through the shared flow and sign in as the other user."""
        self._home_management().go_home_ready()
        login = self.get_other_page_helper("login")
        login.logout_to_login_screen()
        login.perform_login(email, password)
        return self

    def open_home_settings(self, home_name):
        """Primary: open the named home's Settings and expand the Sharing card."""
        self._home_management().open_home_settings(home_name)
        assert self.is_visible("sharing_section", timeout=5), "Sharing section is not displayed on home settings"
        if not self.is_visible("add_user_button", timeout=2):
            self.click("sharing_section_expand", timeout=5)
        return self

    def open_shared_home_settings(self, home_name):
        """Secondary: open the shared home's Settings (shows the shared-by card, not the primary Sharing card)."""
        self._home_management().open_home_settings(home_name)
        assert self.is_visible("shared_by_section", timeout=5), "Shared-by card is not displayed on the shared home settings"
        return self

    def assert_shared_by(self, primary_username, timeout=8):
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self._index_of("card_subtitle", primary_username) is not None:
                return self
            time.sleep(0.5)
        raise AssertionError(f"Shared-by card does not show primary '{primary_username}'")

    def assert_add_user_absent(self):
        assert not self.is_visible("add_user_button", timeout=2), "Add User button should be absent for a secondary user"
        return self

    def share_home_with(self, email, make_primary=False):
        """Open the Add User modal, enter the invitee and confirm."""
        self.click("add_user_button", timeout=5)
        self.send_keys("invite_input", email, clear_first=True, timeout=5)
        if self.platform != "ios":
            self.hide_keyboard_if_visible()
        if make_primary:
            self.click("primary_sharing_button", timeout=5)
        self.click("confirm_add_user_button", timeout=5)
        deadline = time.time() + 8
        while time.time() < deadline and self.is_visible("add_user_overlay", timeout=1):
            time.sleep(0.5)
        return self

    def share_home_with_expecting_rejection(self, email):
        """Enter an invalid invitee and confirm; the modal staying open is the app's rejection signal (success closes it, and the error toast renders under the modal window where the driver cannot read it), then dismiss."""
        self.click("add_user_button", timeout=5)
        self.send_keys("invite_input", email, clear_first=True, timeout=5)
        if self.platform != "ios":
            self.hide_keyboard_if_visible()
        self.click("confirm_add_user_button", timeout=5)
        time.sleep(4)
        still_open = self.is_visible("add_user_overlay", timeout=2)
        if self.is_visible("cancel_add_user_button", timeout=2):
            self.click("cancel_add_user_button", timeout=3)
        return still_open

    def is_user_listed(self, section, email, timeout=8):
        """Whether the email is present in the 'pending' or 'shared' section (rows share a static id, matched on the per-row name TextView)."""
        name_locator = "pending_user_name" if section == "pending" else "shared_user_name"
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self._index_of(name_locator, email) is not None:
                return True
            time.sleep(0.5)
        return False

    def revoke_sharing_for(self, email):
        """Remove one user from whichever section lists them, then confirm the dialog."""
        for name_locator, button_locator in (
            ("shared_user_name", "remove_shared_user_button"),
            ("pending_user_name", "remove_pending_user_button"),
        ):
            index = self._index_of(name_locator, email)
            if index is not None:
                self.find_all(button_locator)[index].click()
                self.click("revoke_confirm_button", timeout=5)
                time.sleep(1)
                return self
        return self

    def dismiss_revoke_dialog_for(self, email):
        """Open the remove dialog for a listed user, then cancel it."""
        for name_locator, button_locator in (
            ("shared_user_name", "remove_shared_user_button"),
            ("pending_user_name", "remove_pending_user_button"),
        ):
            index = self._index_of(name_locator, email)
            if index is not None:
                self.find_all(button_locator)[index].click()
                self.click("revoke_cancel_button", timeout=5)
                time.sleep(1)
                return self
        raise AssertionError(f"{email} not listed in sharing or pending sections")

    def is_invitation_present(self, from_text, timeout=5):
        """True when a sharing invitation matching from_text is in the notification list."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self._index_of("notification_description", from_text) is not None:
                return True
            time.sleep(1)
        return False

    def leave_shared_home(self):
        """Leave the shared home from its settings screen and confirm the dialog."""
        home_management = self._home_management()
        home_management.click("leave_home_button", timeout=10)
        self.click("revoke_confirm_button", timeout=5)
        time.sleep(2)
        return self

    def open_notification_center(self):
        """User tab -> Notification Center."""
        home = self._home_management().go_home_ready()
        home.click("user_button", timeout=5)
        self.click("notifications_row", timeout=5)
        assert self.is_visible("notification_center_header", timeout=5), "Notification Center is not displayed"
        return self

    def act_on_invitation(self, action, match_text, timeout=10):
        """Accept/decline the invitation whose description matches `match_text` (the sharing primary's username, which is what the notification renders: 'Invitation from <username>'), leaving other notifications untouched."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            index = self._index_of("notification_description", match_text)
            if index is not None:
                button_locator = "accept_invitation_button" if action == "accept" else "decline_invitation_button"
                self.find_all(button_locator)[index].click()
                time.sleep(1)
                return self
            time.sleep(0.5)
        raise RuntimeError(f"No sharing invitation matching '{match_text}' in the notification center")

    def assert_toast(self, message, timeout=5):
        """The transient toast title (2.5s on screen) matches `message` within the window right after the triggering action."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self._index_of("toast_title", message) is not None:
                return self
            time.sleep(0.3)
        raise AssertionError(f"No '{message}' toast shown")

    def _element_text(self, element):
        """Displayed text across platforms: Android surfaces it as .text, iOS StaticText often only via the value/label attribute (bare .text comes back empty)."""
        for source in ("text", "value", "label"):
            try:
                raw = element.text if source == "text" else element.get_attribute(source)
            except Exception:
                raw = None
            if raw and raw.strip() and raw.lower() != "null":
                return raw
        return ""

    def _index_of(self, text_locator, needle):
        """Index of the first per-row leaf whose text contains `needle`, else None. Reads text cross-platform (see _element_text) and skips (not aborts on) an element that goes stale while a row is being added/removed; the caller polls."""
        needle_lower = needle.lower()
        try:
            elements = self.find_all(text_locator)
        except StaleElementReferenceException:
            return None
        for index, element in enumerate(elements):
            try:
                if needle_lower in self._element_text(element).lower():
                    return index
            except StaleElementReferenceException:
                continue
        return None
