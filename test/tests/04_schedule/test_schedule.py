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

import pytest
from pytest_bdd import scenarios, then, when, parsers

logger = logging.getLogger(__name__)
pytestmark = [pytest.mark.regression, pytest.mark.schedule]

scenarios("schedule.feature")

SCHEDULE_SUCCESS_TOAST = "Schedule created successfully"


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


@then(parsers.parse('schedule "{name}" should be visible'))
def schedule_should_be_visible(helper, name):
    assert helper.schedules.is_schedule_visible(name, timeout=10, attempts=3), f"Schedule '{name}' should be visible"


@then(parsers.parse('schedule "{name}" should not be visible'))
def schedule_should_not_be_visible(helper, name):
    assert not helper.schedules.is_schedule_visible(name, timeout=5), f"Schedule '{name}' should have been deleted"
