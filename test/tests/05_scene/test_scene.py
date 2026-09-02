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
import time

import pytest
from pytest_bdd import given, scenarios, then, when, parsers

logger = logging.getLogger(__name__)
pytestmark = [pytest.mark.regression, pytest.mark.scene]

scenarios("scene.feature")

SCENE_SUCCESS_TOAST = "Scene created successfully"
SCENE_UPDATED_TOAST = "Scene updated successfully"


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


@then("user should see scene updated successfully toast")
def should_see_scene_updated_toast(helper):
    title = helper.scenes.get_success_toast(timeout=10)
    assert title == SCENE_UPDATED_TOAST, f"Unexpected scene toast: {title}"


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


BULK_PREFIX = "Bulk"


def _bulk_scene_entries(count, operation):
    entries = []
    for index in range(1, count + 1):
        entry = {"name": f"{BULK_PREFIX} {index:02d}", "id": f"BS{index:02d}", "operation": operation}
        if operation == "add":
            entry["action"] = {"Light": {"Power": False}}
        entries.append(entry)
    return entries


@given(parsers.parse('the device already has "{count:d}" bulk scenes'))
def device_has_bulk_scenes(helper, primary_cloud, hardware_session, count,
                           registered_user_resolver, registered_user_password_resolver):
    assert primary_cloud is not None, "Cloud client unavailable for scene injection"
    node_id = hardware_session["node_id"]
    primary_cloud.set_param(node_id, {"Scenes": {"Scenes": _bulk_scene_entries(count, "add")}})
    time.sleep(3)
    # A tab-flip refresh does not rebuild the SDK group snapshot the selection screen reads, so re-login for a fresh fetch.
    helper.group_sharing.relogin(registered_user_resolver("registered user 1"),
                                 registered_user_password_resolver("registered user 1 password"))


@when("user removes all bulk scenes from the cloud")
def remove_bulk_scenes(primary_cloud, hardware_session):
    node_id = hardware_session["node_id"]
    primary_cloud.set_param(node_id, {"Scenes": {"Scenes": _bulk_scene_entries(10, "remove")}})


@when(parsers.parse('user opens scene "{name}" for editing'))
def open_scene_for_editing(helper, name):
    helper.scenes.open_scene(name)
    assert helper.scenes.is_create_scene_screen_displayed(timeout=10), "Scene editor did not open"


@when(parsers.parse('user renames the open scene to "{new_name}"'))
def rename_open_scene(helper, new_name):
    helper.scenes.rename_open_scene(new_name)


@then("the max scenes badge should be shown for the device")
def max_scenes_badge_shown(helper):
    assert helper.scenes.is_visible("max_scene_badge", timeout=10), \
        "Max Scene Reached badge not shown at 10 scenes"
