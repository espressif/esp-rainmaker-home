# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
End-to-end BDD test for the scene flow: create with params, verify listed,
activate, confirm execution via the device serial log, then delete.

Shared steps (launch, login, home, device reserve/prepare/verify) live in
test/conftest.py.
"""
import logging

import pytest
from pytest_bdd import scenarios, then, when, parsers

logger = logging.getLogger(__name__)
pytestmark = [pytest.mark.regression, pytest.mark.scene]

scenarios("scene.feature")

SCENE_SUCCESS_TOAST = "Scene created successfully"


@when("user opens the scene tab")
def open_scene_tab(helper):
    helper.scenes.open_scene_tab()


@then("user should be on scenes screen")
def should_be_on_scenes_screen(helper):
    assert helper.scenes.check_screen_displayed(timeout=10), "Should be on scenes screen"


@when("user removes any existing scenes")
def remove_existing_scenes(helper):
    helper.scenes.delete_all_scenes()


@when("user taps add scene")
def tap_add_scene(helper):
    helper.scenes.tap_add_scene()


@when(parsers.parse('user names the scene "{name}"'))
def name_the_scene(helper, name):
    helper.scenes.enter_scene_name(name)


@then("user should be on create scene screen")
def should_be_on_create_scene_screen(helper):
    assert helper.scenes.is_create_scene_screen_displayed(timeout=10), "Should be on create scene screen"


@when("user taps add action")
def tap_add_action(helper):
    helper.scenes.tap_add_action()


@when(parsers.parse('user selects the "{name}" device'))
def select_device(helper, name):
    helper.scenes.select_named_device(name)


@when(parsers.parse('user sets action "{param}" to "{value}"'))
def set_action_param(helper, hardware_session, param, value):
    hardware_session.setdefault("set_values", {})[param] = helper.scenes.select_action_param(param, value)


@when("user finishes the action")
def finish_action(helper):
    helper.scenes.finish_action()


@when("user saves the scene")
def save_the_scene(helper):
    helper.scenes.save_scene()


@then("user should see scene created successfully toast")
def should_see_scene_created_toast(helper):
    title = helper.scenes.get_success_toast(timeout=10)
    assert title == SCENE_SUCCESS_TOAST, f"Unexpected scene toast: {title}"


@then(parsers.parse('scene "{name}" should be visible'))
def scene_should_be_visible(helper, name):
    assert helper.scenes.is_scene_visible(name, timeout=10, attempts=3), f"Scene '{name}' should be visible"


@then(parsers.parse('scene "{name}" should not be visible'))
def scene_should_not_be_visible(helper, name):
    assert not helper.scenes.is_scene_visible(name, timeout=5), f"Scene '{name}' should have been deleted"


@when(parsers.parse('user activates scene "{name}"'))
def activate_scene(helper, hardware_session, name):
    hardware_session["serial_since"] = hardware_session["device_serial"].marker()
    helper.scenes.activate_scene(name)
