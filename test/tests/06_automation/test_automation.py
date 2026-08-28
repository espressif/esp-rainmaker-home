# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
End-to-end BDD test for the automation flow: create event+action, verify
listed, raise the trigger event on the device over serial, confirm the action
ran via the device serial log, then disable and delete.

Shared steps (launch, login, home, device reserve/prepare/report/verify) live
in test/conftest.py.
"""
import logging
import time

import pytest
from pytest_bdd import scenarios, then, when, parsers

logger = logging.getLogger(__name__)
pytestmark = [pytest.mark.regression, pytest.mark.automation]

scenarios("automation.feature")

AUTOMATION_SUCCESS_TOAST = "Automation created successfully"


@when("user opens the automation tab")
def open_automation_tab(helper):
    helper.automations.open_automation_tab()


@then("user should be on automations screen")
def should_be_on_automations_screen(helper):
    assert helper.automations.check_screen_displayed(timeout=10), "Should be on automations screen"


@when("user removes any existing automations")
def remove_existing_automations(helper):
    helper.automations.delete_all_automations()


@when("user taps add automation")
def tap_add_automation(helper):
    helper.automations.tap_add_automation()


@when(parsers.parse('user names the automation "{name}"'))
def name_the_automation(helper, name):
    helper.automations.enter_automation_name(name)


@then("user should be on create automation screen")
def should_be_on_create_automation_screen(helper):
    assert helper.automations.is_create_automation_screen_displayed(timeout=10), "Should be on create automation screen"


@when("user taps add event")
def tap_add_event(helper):
    helper.automations.click("add_event_button", timeout=10)


@when(parsers.parse('user selects the "{name}" event device'))
def select_event_device(helper, name):
    helper.automations.select_event_device_by_name(name)


@when(parsers.parse('user sets event "{param}" to "{value}"'))
def set_event_param(helper, hardware_session, param, value):
    hardware_session.setdefault("set_values", {})[param] = helper.automations.select_event_param(param, value)


@when("user taps add action")
def tap_add_action(helper):
    helper.automations.click("add_action_button", timeout=10)


@when(parsers.parse('user selects the "{name}" action device'))
def select_action_device(helper, name):
    helper.automations.select_action_device_by_name(name)


@when(parsers.parse('user sets action "{param}" to "{value}"'))
def set_action_param(helper, hardware_session, param, value):
    hardware_session.setdefault("set_values", {})[param] = helper.automations.select_action_param(param, value)


@when("user creates the automation")
def create_the_automation(helper):
    helper.automations.create_automation()


@then("user should see automation created successfully toast")
def should_see_automation_created_toast(helper, hardware_session):
    title = helper.automations.get_success_toast(timeout=10)
    assert title == AUTOMATION_SUCCESS_TOAST, f"Unexpected automation toast: {title}"
    hardware_session["automation_live_since"] = hardware_session["device_serial"].marker()


@when(parsers.parse('the device raises the automation trigger "{param}" as "{value}"'))
def raise_automation_trigger(hardware_session, param, value):
    ds = hardware_session["device_serial"]
    live_since = hardware_session.get("automation_live_since", 0)
    early = [line for line in ds.lines()[live_since:] if "via : Cloud" in line]
    assert not early, f"Automation fired before the trigger event (cloud early-fire): {early[-1].strip()}"
    hardware_session["serial_since"] = ds.marker()
    hardware_session.get("set_values", {}).pop(param, None)
    if value in ("on", "true", "off", "false"):
        coerced = value in ("on", "true")
    else:
        coerced = int(value) if value.lstrip("-").isdigit() else value
    ds.set_param(param, coerced)


@then(parsers.parse('automation "{name}" should be visible'))
def automation_should_be_visible(helper, name):
    assert helper.automations.is_automation_visible(name, timeout=10, attempts=3), f"Automation '{name}' should be visible"


@then(parsers.parse('automation "{name}" should not be visible'))
def automation_should_not_be_visible(helper, name):
    assert not helper.automations.is_automation_visible(name, timeout=5), f"Automation '{name}' should have been deleted"


@when(parsers.parse('user disables automation "{name}"'))
def disable_automation(helper, name):
    helper.automations.toggle_automation(name, toggle="off")


EVENT_CONDITION_SYMBOLS = {"above": ">", "below": "<"}


@when(parsers.re(r'user sets event "(?P<param>[^"]+)" (?P<condition>above|below) "(?P<value>[^"]+)"'))
def set_event_param_with_condition(helper, hardware_session, param, condition, value):
    hardware_session.setdefault("set_values", {})[param] = \
        helper.automations.select_event_param_with_condition(param, EVENT_CONDITION_SYMBOLS[condition], value)


@when(parsers.parse('user opens automation "{name}" for editing'))
def open_automation_for_editing(helper, name):
    helper.automations.open_automation(name)


@when(parsers.parse('user edits the automation action "{param}" to "{value}" for "{device}"'))
def edit_automation_action(helper, hardware_session, param, value, device):
    hardware_session.setdefault("set_values", {})[param] = \
        helper.automations.edit_action_param(device, param, value)


@when("user updates the automation")
def update_the_automation(helper):
    helper.automations.click("update_automation_button", timeout=10)
    # Wait out the save round-trip, then give the cloud automation engine time to apply the updated action.
    helper.automations.get_success_toast(timeout=10)
    time.sleep(5)
