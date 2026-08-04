# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Scenes page helper: create a scene, activate it, and clean up."""

from .base import BasePage


class Scenes(BasePage):
    def open_scene_tab(self):
        """Open the Scenes screen from the footer tab."""
        self.click("scene_tab", timeout=10)
        return self

    def refresh_scenes(self):
        """Refresh the scenes list so cloud-side changes are reflected."""
        return self.refresh_list()

    def delete_all_scenes(self):
        """Remove every scene via its menu (leave edit mode first so the card tap opens the menu, then tap card -> menu -> delete)."""
        self.set_editing("text_edit_scenes", "edit_scenes_button", False)
        return self.delete_all_via_card_menu(
            "scene_card", "button_delete_scene_menu",
            dismiss_id="button_close_scene_menu",
        )

    def tap_add_scene(self):
        """Tap the Add Scene button."""
        self.click("add_scene_button", timeout=10)
        return self

    def enter_scene_name(self, name):
        """Type the scene name and confirm."""
        self.send_keys("name_input", name, clear_first=True, timeout=10)
        if self.platform != "ios":
            self.hide_keyboard_if_visible()
        self.click("name_confirm_button", timeout=10)
        return self

    def tap_add_action(self):
        """Tap the add-action control on the Create Scene screen."""
        self.click("add_action_button", timeout=10)
        return self

    def select_action_param(self, param_name, value):
        """Open a named action param, set its value, and return the value actually applied."""
        self.open_param_editor(f"button_device_param_{param_name}_selection", "param_value_save_button")
        actual = self.set_modal_param_value(param_name, value)
        self.click("param_value_save_button", timeout=10)
        return actual

    def finish_action(self):
        """Leave the action and device-selection screens, back to Create Scene."""
        self.click("action_done_button", timeout=10)
        self.click("device_selection_done_button", timeout=10)
        return self

    def save_scene(self):
        """Save the scene on the Create Scene screen."""
        self.click("save_scene_button", timeout=10)
        return self

    def activate_scene(self, name):
        """Open a scene's menu from the list and tap Activate."""
        self.set_editing("text_edit_scenes", "edit_scenes_button", False)
        self.click("id", f"card_scene_{name}", timeout=10)
        self.click("activate_scene_option", timeout=10)
        return self

    def is_create_scene_screen_displayed(self, timeout=10):
        """True when the Create Scene screen is shown (its Save control is present)."""
        return self.is_visible("save_scene_button", timeout=timeout)

    def is_scene_visible(self, name, timeout=10, attempts=1):
        """True when a scene card with the given name is listed."""
        return self.is_named_item_visible(f"card_scene_{name}", timeout, attempts)
