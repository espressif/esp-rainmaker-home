# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
End-to-end BDD test for the schedule flow: create a one-time schedule at a
near-future time, verify listed, wait for it to fire, confirm execution via
the device serial log, then delete.

Shared steps (launch, login, home, device reserve/prepare/verify) live in
test/conftest.py.
"""
import logging
import time

import pytest
from pytest_bdd import given, scenarios, then, when, parsers

logger = logging.getLogger(__name__)
pytestmark = [pytest.mark.regression, pytest.mark.schedule]

scenarios("schedule.feature")

SCHEDULE_SUCCESS_TOAST = "Schedule created successfully"
SCHEDULE_UPDATED_TOAST = "Schedule updated successfully"


@when("user opens the schedule tab")
def open_schedule_tab(helper):
    helper.schedules.open_schedule_tab()


@then("user should be on schedules screen")
def should_be_on_schedules_screen(helper):
    assert helper.schedules.check_screen_displayed(timeout=10), "Should be on schedules screen"


@when("user removes any existing schedules")
def remove_existing_schedules(helper):
    helper.schedules.delete_all_schedules()


@when("user taps add schedule")
def tap_add_schedule(helper):
    helper.schedules.tap_add_schedule()


@when(parsers.parse('user names the schedule "{name}"'))
def name_the_schedule(helper, name):
    helper.schedules.enter_schedule_name(name)


@then("user should be on create schedule screen")
def should_be_on_create_schedule_screen(helper):
    assert helper.schedules.is_create_schedule_screen_displayed(timeout=10), "Should be on create schedule screen"


@when(parsers.parse('user sets the schedule time "{minutes}" minutes ahead'))
def set_schedule_time(helper, minutes):
    helper.schedules.set_time_ahead(int(minutes))


@when("user taps add action")
def tap_add_action(helper):
    helper.schedules.tap_add_action()


@when(parsers.parse('user selects the "{name}" device'))
def select_device(helper, name):
    helper.schedules.select_named_device(name)


@when(parsers.parse('user sets action "{param}" to "{value}"'))
def set_action_param(helper, hardware_session, param, value):
    hardware_session.setdefault("set_values", {})[param] = helper.schedules.set_action_param(param, value)


@when("user finishes the action")
def finish_action(helper):
    helper.schedules.finish_action()


@when("user saves the schedule")
def save_the_schedule(helper, hardware_session):
    helper.schedules.save_schedule()
    hardware_session["serial_since"] = hardware_session["device_serial"].marker()


@then("user should see schedule created successfully toast")
def should_see_schedule_created_toast(helper):
    title = helper.schedules.get_success_toast(timeout=10)
    assert title == SCHEDULE_SUCCESS_TOAST, f"Unexpected schedule toast: {title}"


@then("user should see schedule updated successfully toast")
def should_see_schedule_updated_toast(helper):
    title = helper.schedules.get_success_toast(timeout=10)
    assert title == SCHEDULE_UPDATED_TOAST, f"Unexpected schedule toast: {title}"


@then(parsers.parse('schedule "{name}" should be visible'))
def schedule_should_be_visible(helper, name):
    assert helper.schedules.is_schedule_visible(name, timeout=10, attempts=3), f"Schedule '{name}' should be visible"


@then(parsers.parse('schedule "{name}" should not be visible'))
def schedule_should_not_be_visible(helper, name):
    assert not helper.schedules.is_schedule_visible(name, timeout=5), f"Schedule '{name}' should have been deleted"


BULK_PREFIX = "Bulk"


def _bulk_schedule_entries(count, operation):
    entries = []
    for index in range(1, count + 1):
        entry = {"name": f"{BULK_PREFIX}{index:02d}", "id": f"BK{index:02d}", "operation": operation}
        if operation == "add":
            entry.update({"triggers": [{"d": 127, "m": 1380}],
                          "action": {"Light": {"Power": False}}})
        entries.append(entry)
    return entries


def _neo_bulk_schedules(count):
    """RMNEO schedule items: replace-all list, each needing id/name/enabled/triggers/action."""
    return [{"id": f"BK{index:02d}", "name": f"{BULK_PREFIX}{index:02d}", "enabled": True,
             "triggers": [{"d": 127, "m": 1380}], "action": {"Light": {"Power": False}}}
            for index in range(1, count + 1)]


def _inject_bulk_schedules(primary_cloud, hardware_session, count, operation):
    """Seed/clear schedules; RMNEO params are MQTT-only but its schedules have their own REST endpoint."""
    assert primary_cloud is not None, "Cloud client unavailable for schedule injection"
    node_id = hardware_session["node_id"]
    if hasattr(primary_cloud, "set_schedules"):
        primary_cloud.set_schedules(node_id, _neo_bulk_schedules(count) if operation == "add" else [])
        return
    primary_cloud.set_param(node_id, {"Schedule": {"Schedules": _bulk_schedule_entries(count, operation)}})


@given(parsers.parse('the device already has "{count:d}" bulk schedules'))
def device_has_bulk_schedules(helper, primary_cloud, hardware_session, count,
                              registered_user_resolver, registered_user_password_resolver):
    _inject_bulk_schedules(primary_cloud, hardware_session, count, "add")
    time.sleep(3)
    # A tab-flip refresh does not rebuild the SDK group snapshot the selection screen reads, so re-login for a fresh fetch.
    helper.group_sharing.relogin(registered_user_resolver("registered user 1"),
                                 registered_user_password_resolver("registered user 1 password"))


@when("user removes all bulk schedules from the cloud")
def remove_bulk_schedules(primary_cloud, hardware_session):
    _inject_bulk_schedules(primary_cloud, hardware_session, 10, "remove")


@when(parsers.parse('user toggles schedule "{name}" via the inline switch'))
def toggle_schedule_switch(helper, name):
    helper.schedules.toggle_schedule(name)


@when(parsers.parse('user opens schedule "{name}" for editing'))
def open_schedule_for_editing(helper, name):
    helper.schedules.open_schedule(name)
    assert helper.schedules.is_create_schedule_screen_displayed(timeout=10), \
        "Schedule editor did not open"


@when(parsers.parse('user renames the open schedule to "{new_name}"'))
def rename_open_schedule(helper, new_name):
    helper.schedules.rename_open_schedule(new_name)


@then("the max schedules badge should be shown for the device")
def max_schedules_badge_shown(helper):
    assert helper.schedules.is_visible("max_schedule_badge", timeout=10), \
        "Max Schedule Reached badge not shown at 10 schedules"
