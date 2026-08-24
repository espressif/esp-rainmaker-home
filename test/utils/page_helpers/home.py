# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Home Page Helper."""
import logging
import time

from .base import BasePage

logger = logging.getLogger(__name__)


class Home(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)

    def handle_nickname_popup(self, action: str = "skip", nickname: str = None):
        """
        Handle the nickname pop-up that appears after signup.

        @param action - Action to perform on the pop-up ("skip" or "add")
        @param nickname - Nickname to add if action is "add"
        @returns self
        """
        logger.info(f"Attempting to handle nickname pop-up with action: {action} and nickname: {nickname}")

        if action == "skip":
            element = self.find_visible("nickname_skip_button", timeout=5)
            if element:
                element.click()
                logger.info("Clicked nickname skip button")
            else:
                logger.warning("Nickname skip button not found")
        elif action == "add":
            self.send_keys("nickname_input", nickname, timeout=5)
            self.click("nickname_add_button", timeout=2)
        else:
            raise ValueError(f"Invalid action: {action}")
        return self

    def open_add_device(self, timeout=15):
        """
        Tap Add Device on home — header button when devices exist,
        or empty-state banner button when no devices are provisioned yet.

        Polls for the whole window instead of probing once, because home renders as an
        interactive skeleton before its store hydrates and neither entry point exists until
        it does; a single 2s probe lands inside that gap and reports the button as missing.
        """
        end_time = time.monotonic() + timeout
        while time.monotonic() < end_time:
            if self.is_visible("add_device_button", timeout=1):
                self.click("add_device_button")
                return self
            if self.is_visible("add_device_banner_button", timeout=1):
                logger.info("Using empty-state banner add device button")
                self.click("add_device_banner_button")
                return self
            time.sleep(1)
        raise Exception(f"Add device entry point not found on home screen within {timeout}s")

    def open_device(self, device_name: str, timeout=10):
        """Open a provisioned device's control screen by its display name."""
        end_time = time.monotonic() + timeout
        while time.monotonic() < end_time:
            for label in self.find_all("device_names_text"):
                try:
                    if (label.text or "").strip() == device_name and label.is_displayed():
                        label.click()
                        return self
                except Exception:
                    continue
            time.sleep(0.5)
        raise RuntimeError(f"Device '{device_name}' not found on home screen")

    def acknowledge_migration_dialog(self):
        """Acknowledge the migration prompt if it is shown."""
        try:
            if self.is_visible("button_migration_prompt_understood", timeout=0.5):
                self.click("button_migration_prompt_understood", timeout=3)
                logger.info("Acknowledged migration prompt")
                time.sleep(1)
                return True
        except Exception:
            pass
        return False

    def wait_home_after_login(self, timeout=20):
        """Wait for home after login, clearing the one-time migration prompt and any system alerts that overlay it."""
        perms = self.get_other_page_helper('permissions')
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            if perms.any_system_alert_present(timeout=1):
                perms.handle_all_permissions(action="allow", timeout=2)
            self.acknowledge_migration_dialog()
            if self.check_screen_displayed(timeout=2):
                return True
            time.sleep(1)
        return False

    def go_home(self):
        """Return to the home screen, stepping out of nested screens via the header back button (iOS has no hardware back) until the footer Home tab is reachable."""
        for _ in range(6):
            if self.is_id_visible("button_tab_home", 2):
                self.click("id", "button_tab_home", timeout=5)
                time.sleep(1)
                return self
            if self.is_id_visible("button_back", 2):
                self.click("id", "button_back", timeout=3)
            else:
                try:
                    self.driver.back()
                except Exception:
                    pass
            time.sleep(0.6)
        return self

    def _refresh_home_device_list(self):
        """Force the home device list to re-fetch by switching to another tab and back."""
        try:
            if self.is_id_visible("button_tab_user", 2):
                self.click("id", "button_tab_user", timeout=5)
                time.sleep(1.5)
        except Exception:
            pass
        self.go_home()

    def is_device_visible(self, device_name: str, timeout=10, attempts=1):
        """Check whether a provisioned device name is visible on the home screen (polling up to timeout)."""
        logger.info("Checking device visibility on home: %s", device_name)
        for attempt in range(attempts):
            if attempt:
                logger.info("Device '%s' not visible yet (attempt %s/%s); refreshing home list", device_name, attempt + 1, attempts)
                self._refresh_home_device_list()
            end_time = time.monotonic() + timeout
            while time.monotonic() < end_time:
                for label in self.find_all("device_names_text"):
                    if (label.text or "").strip() == device_name and label.is_displayed():
                        logger.info("Device '%s' is visible on home screen", device_name)
                        return True
                time.sleep(0.5)

        logger.warning(
            "Device '%s' not visible on home screen within %ss",
            device_name,
            timeout,
        )
        return False

    def is_device_online(self, device_name, timeout=120):
        """Poll until the named device's home card is online. The app renders the offline badge (text_offline_device_card) only when a device is offline, so online = that badge is absent from the device's card. Long default since a freshly-commissioned Matter node is slow to establish its cloud link."""
        logger.info("Waiting up to %ss for device '%s' to be online on home", timeout, device_name)
        name_by = self.get_element_locator("device_names_text")
        offline_by = self.get_element_locator("device_offline_badge")
        end_time = time.monotonic() + timeout
        while time.monotonic() < end_time:
            for card in self.find_all("device_card"):
                try:
                    label = card.find_element(*name_by)
                    if (label.text or "").strip() != device_name or not label.is_displayed():
                        continue
                    if not card.find_elements(*offline_by):
                        logger.info("Device '%s' is online on home screen", device_name)
                        return True
                except Exception:
                    continue
            time.sleep(2)
        logger.warning("Device '%s' not online on home screen within %ss", device_name, timeout)
        return False

    def _card_power_switch(self, device_name, timeout=10):
        """The power switch inside the card holding `device_name`, scoping child lookups to the matching card."""
        name_by = self.get_element_locator("device_names_text")
        switch_by = self.get_element_locator("card_power_switch")
        end_time = time.monotonic() + timeout
        while time.monotonic() < end_time:
            for card in self.find_all("device_card"):
                try:
                    label = card.find_element(*name_by)
                    if (label.text or "").strip() != device_name:
                        continue
                    return card.find_element(*switch_by)
                except Exception:
                    continue
            time.sleep(0.5)
        raise RuntimeError(f"Power switch for '{device_name}' not found on home screen")

    def read_card_power(self, device_name, timeout=10):
        """Return 'on'/'off' from the device's home-card power switch."""
        from appium.webdriver.common.appiumby import AppiumBy
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                switch = self._card_power_switch(device_name, timeout=2)
            except Exception:
                time.sleep(0.5)
                continue
            if switch.find_elements(AppiumBy.ID, "card_power_state_on"):
                return "on"
            if switch.find_elements(AppiumBy.ID, "card_power_state_off"):
                return "off"
            time.sleep(0.5)
        return None

    def set_card_power(self, device_name, target_on, timeout=15):
        """Set the device's home-card power switch to target_on, verified via readback plus a persistence re-check."""
        want = "on" if target_on else "off"
        logger.info("Setting home-card power of '%s' to %s", device_name, want)
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.read_card_power(device_name, timeout=5) == want:
                time.sleep(4)
                settled = self.read_card_power(device_name, timeout=5)
                if settled == want:
                    return self
                raise RuntimeError(
                    f"Home-card power of '{device_name}' flipped to {want} but reverted to {settled} "
                    "— app dropped the param write (optimistic UI, no delivery)")
            self._card_power_switch(device_name, timeout=5).click()
            time.sleep(1)
        raise RuntimeError(f"Could not set home-card power of '{device_name}' to {want}")

    def is_local_control_badge_visible(self, timeout=10):
        """Whether any home card shows the 'Available on WLAN' local-control badge."""
        return self.is_visible("local_control_badge", timeout=timeout)

    def ensure_device_name(self, target, aliases=()):
        """Make sure a device named `target` is on the home screen; if it's listed under a known alias (e.g. left by provisioning or a prior name), rename it to `target` via the device settings screen. Re-enters home first so a just-applied cloud rename has refreshed into the list."""
        for attempt in range(3):
            self.go_home()
            if self.is_device_visible(target, timeout=10):
                return self
            for alias in aliases:
                if not self.is_device_visible(alias, timeout=3):
                    continue
                logger.info("Renaming device '%s' -> '%s'", alias, target)
                self.open_device(alias)
                self.click("id", "button_more", timeout=10)
                self.click("id", "button_edit_device_name", timeout=10)
                self.send_keys("id", "input_device_name", target, clear_first=True, timeout=10)
                self.hide_keyboard_if_visible()
                time.sleep(2)
                self.go_home()
                if self.is_device_visible(target, timeout=15):
                    return self
            logger.info("Device '%s' not visible yet (attempt %s/3); refreshing home list", target, attempt + 1)
            self._refresh_home_device_list()
        raise RuntimeError(f"Device '{target}' not on the home screen (aliases tried: {list(aliases)})")
