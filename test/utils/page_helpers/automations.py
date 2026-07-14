# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Automations page helper: create an event+action automation, then toggle/clean up."""

import time

from .base import BasePage


class Automations(BasePage):
    def open_automation_tab(self):
        """Open the Automations screen from the footer tab."""
        self.click("automation_tab", timeout=10)
        return self

    def delete_all_automations(self):
        """Remove every automation via its menu (tap card -> menu -> delete)."""
        return self.delete_all_via_card_menu(
            "automation_card", "automation_menu_option_delete",
            dismiss_id="automation_menu_backdrop",
        )

    def tap_add_automation(self):
        """Tap the Add Automation control (an icon button; match by visibility, not clickable state)."""
        el = self.find_visible("add_automation_button", timeout=10)
        if not el:
            raise RuntimeError("Add Automation button not found")
        el.click()
        return self

    def enter_automation_name(self, name):
        """Type the automation name and confirm."""
        self.send_keys("name_input", name, clear_first=True, timeout=10)
        if self.platform != "ios":
            self.hide_keyboard_if_visible()
        self.click("name_confirm_button", timeout=10)
        return self

    def select_event_device_by_name(self, name):
        """Select a device row on the event device-selection screen."""
        return self.select_list_item("event_device_item", name)

    def select_action_device_by_name(self, name):
        """Select a device row on the action device-selection screen (multi-select: tap the row, not the label, so it navigates to the param config)."""
        return self.select_list_item("action_device_item", name)

    def select_event_param(self, param_name, value):
        """Open a named event trigger param, set its value/condition, finish the event."""
        self.click("id", f"button_event_device_param_{param_name}_selection", timeout=10)
        actual = self.set_modal_param_value(param_name, value)
        self.click("event_param_save_button", timeout=10)
        self.click("event_done_button", timeout=10)
        return actual

    def select_action_param(self, param_name, value):
        """Open a named action param, set its value, finish the action and device selection."""
        self.click("id", f"button_action_device_param_{param_name}_selection", timeout=10)
        actual = self.set_modal_param_value(param_name, value)
        self.click("action_param_save_button", timeout=10)
        self.click("action_done_button", timeout=10)
        self.click("action_device_done_button", timeout=10)
        return actual

    def create_automation(self):
        """Create the automation on the Create Automation screen."""
        self.click("create_automation_button", timeout=10)
        return self

    def find_automation(self, name, timeout=10):
        """The list card holding the named automation (wrapper id card_automation_<name>)."""
        card = self.find_visible("id", f"card_automation_{name}", timeout=timeout)
        if not card:
            raise RuntimeError(f"Automation '{name}' not found in the list")
        return card

    def toggle_automation(self, name, toggle):
        """Set the named automation's switch to 'on'/'off' via the switch inside its card."""
        from appium.webdriver.common.appiumby import AppiumBy
        want = "automation_card_enabled" if toggle == "on" else "automation_card_disabled"
        card = self.find_automation(name)
        if card.find_elements(AppiumBy.ID, want):
            return self
        switch_by = self.get_element_locator("enable_disable_automation")
        card.find_element(*switch_by).click()
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            try:
                if self.find_automation(name, timeout=2).find_elements(AppiumBy.ID, want):
                    return self
            except RuntimeError:
                pass
            time.sleep(0.5)
        raise RuntimeError(f"Automation '{name}' switch did not reach '{toggle}'")

    def is_create_automation_screen_displayed(self, timeout=10):
        """True when the Create Automation screen is shown (its Create control is present)."""
        return self.is_visible("create_automation_button", timeout=timeout)

    def is_automation_visible(self, name, timeout=10, attempts=1):
        """True when an automation card with the given name is listed."""
        return self.is_named_item_visible(f"card_automation_{name}", timeout=timeout, attempts=attempts)
