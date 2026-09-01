# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Automations page helper: create an event+action automation, then toggle/clean up."""

import logging
import time

from .base import BasePage

logger = logging.getLogger(__name__)


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

    def tap_add_automation(self, attempts=3):
        """Tap the Add Automation control (an icon button) until the name dialog opens; a list re-render can swallow the first tap."""
        for attempt in range(attempts):
            el = self.find_visible("add_automation_button", timeout=10)
            if not el:
                raise RuntimeError("Add Automation button not found")
            el.click()
            if self.is_visible("name_input", timeout=5):
                return self
            logger.info("RETRY tap_add_automation: name dialog not shown, re-tapping (attempt %s/%s)", attempt + 1, attempts)
        raise AssertionError("Add-automation name dialog did not open")

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
        self.open_param_editor(f"button_event_device_param_{param_name}_selection", "event_param_save_button")
        actual = self.set_modal_param_value(param_name, value)
        self.click("event_param_save_button", timeout=10)
        self.click("event_done_button", timeout=10)
        return actual

    def select_event_param_with_condition(self, param_name, condition, value):
        """Like select_event_param but picks the trigger condition chip (==, >, <) first."""
        self.open_param_editor(f"button_event_device_param_{param_name}_selection", "event_param_save_button")
        condition_key = {">": "gt", "<": "lt", "==": "eq"}[condition]
        self.click(f"event_condition_{condition_key}_button", timeout=5)
        actual = self.set_modal_param_value(param_name, value)
        self.click("event_param_save_button", timeout=10)
        self.click("event_done_button", timeout=10)
        return actual

    def edit_action_param(self, device, param_name, value):
        """Open an existing action from the editor — its row opens the action device selection scoped to that device — then reopen the sole selected row's params and update one param."""
        self.click("id", f"button_automation_action_{device}", timeout=10)
        self.select_list_item("action_device_item", timeout=10)
        self.open_param_editor(f"button_action_device_param_{param_name}_selection", "action_param_save_button")
        actual = self.set_modal_param_value(param_name, value)
        self.click("action_param_save_button", timeout=10)
        # Two sheets unwind back to the editor: the param list (Done shares the create-footer id) then the device selection (its own Done).
        for attempt in range(6):
            if self.is_visible("update_automation_button", timeout=3):
                return actual
            if attempt > 1:
                logger.info("RETRY edit_action_param unwind: editor not reached yet (attempt %s/6)", attempt + 1)
            if self.is_visible("action_done_button", timeout=2):
                self.click("action_done_button", timeout=5)
            elif self.is_visible("action_selection_done_button", timeout=2):
                self.click("action_selection_done_button", timeout=5)
        raise AssertionError("Action selection sheet did not close back to the automation editor")

    def select_action_param(self, param_name, value):
        """Open a named action param, set its value, finish the action and device selection."""
        self.open_param_editor(f"button_action_device_param_{param_name}_selection", "action_param_save_button")
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

    def open_automation(self, name, attempts=3):
        """Open the named automation for editing via its card menu (re-tap in case a transient toast swallows the tap)."""
        for attempt in range(attempts):
            self.find_automation(name).click()
            if self.is_visible("automation_menu_edit_option", timeout=5):
                break
            logger.info("RETRY open_automation(%r): menu not shown, re-tapping card (attempt %s/%s)", name, attempt + 1, attempts)
        else:
            raise AssertionError(f"Automation menu did not open for {name!r}")
        self.click("automation_menu_edit_option", timeout=5)
        assert self.is_visible("update_automation_button", timeout=20), f"Automation editor did not open for {name!r}"
        return self

    def toggle_automation(self, name, toggle, attempts=3):
        """Set the named automation's switch to 'on'/'off' via the switch inside its card. The trigger's own push banner ("Successfully triggered automation…") sits over the card for ~5s and receives the tap instead of the switch, so verify the flip and re-tap once it clears — same as a real user."""
        from appium.webdriver.common.appiumby import AppiumBy
        want = "automation_card_enabled" if toggle == "on" else "automation_card_disabled"
        for attempt in range(attempts):
            card = self.find_automation(name)
            if card.find_elements(AppiumBy.ID, want):
                return self
            switch_by = self.get_element_locator("enable_disable_automation")
            card.find_element(*switch_by).click()
            deadline = time.monotonic() + 6
            while time.monotonic() < deadline:
                try:
                    if self.find_automation(name, timeout=2).find_elements(AppiumBy.ID, want):
                        return self
                except RuntimeError:
                    pass
                time.sleep(0.5)
            logger.info("RETRY toggle_automation(%r): switch not %r after tap, re-tapping (attempt %s/%s)", name, toggle, attempt + 1, attempts)
        raise RuntimeError(f"Automation '{name}' switch did not reach '{toggle}'")

    def is_create_automation_screen_displayed(self, timeout=10):
        """True when the Create Automation screen is shown (its Create control is present)."""
        return self.is_visible("create_automation_button", timeout=timeout)

    def is_automation_visible(self, name, timeout=10, attempts=1):
        """True when an automation card with the given name is listed."""
        return self.is_named_item_visible(f"card_automation_{name}", timeout=timeout, attempts=attempts)
