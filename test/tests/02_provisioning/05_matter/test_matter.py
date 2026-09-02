# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""BDD tests for Matter commissioning via the platform pairing UI (setup in this section's conftest.py)."""
import logging

import pytest
from pytest_bdd import scenarios, when, then, parsers

logger = logging.getLogger(__name__)
pytestmark = [pytest.mark.regression, pytest.mark.provisioning, pytest.mark.matter, pytest.mark.timeout(900)]

scenarios("matter.feature")


@when(parsers.parse('user adds a device via "{method}"'))
def add_device_via(helper, method):
    if method == "scan qr":
        # Add Device opens the QR scanner directly, so there is no option to pick.
        helper.add_device.open_from_home()
    elif method == "manual pairing code":
        # The provisioning-option list is only reachable from that scanner;
        # open_selection_from_scanner() opens Add Device itself when needed.
        helper.add_device.open_selection_from_scanner()
        helper.add_device.select_matter_manual_option()
    else:
        raise AssertionError(f"Unsupported matter add-device method: {method}")


@when("user enters the matter pairing code")
def enter_matter_pairing_code(helper, matter_device):
    assert matter_device.manual_code, \
        "No manual pairing code available (set MATTER_MANUAL_CODE for the static-override path)"
    helper.matter_manual.enter_pairing_code(matter_device.manual_code)


@when("user completes the ecosystem commissioning")
def complete_ecosystem_commissioning(helper):
    helper.matter_commissioning.complete_commissioning()


@then("the matter device should be commissioned successfully")
def matter_commissioned(matter_device):
    assert matter_device.wait_for_serial("Commissioning Complete", timeout=120), \
        "Device serial did not report commissioning completion"


@then("the home screen should show the matter device as locally reachable")
def matter_device_local(helper):
    helper.home.go_home()
    assert helper.home.is_local_control_badge_visible(timeout=90), \
        "Matter device not shown as locally reachable (Available on WLAN) on the home screen"


@then("the matter device should be visible on home screen")
def matter_device_visible(helper, matter_light_name):
    assert helper.home.is_device_visible(matter_light_name, timeout=60), \
        f"Device '{matter_light_name}' should be visible on home screen"


@then("the matter device should be online on the home screen")
def matter_device_online(helper, matter_light_name):
    helper.home.go_home()
    assert helper.home.is_device_online(matter_light_name, timeout=120), \
        f"Device '{matter_light_name}' did not come online on the home screen within 120s"


@when(parsers.parse('user prepares the matter device power "{state}"'))
def prepare_matter_power(helper, matter_light_name, state):
    helper.home.go_home()
    helper.home.set_card_power(matter_light_name, state == "on")


@when(parsers.parse('user toggles the matter device power "{state}" from the home screen'))
def toggle_matter_power(helper, matter_device, matter_light_name, state):
    helper.home.go_home()
    matter_device.mark_serial()
    helper.home.set_card_power(matter_light_name, state == "on")


@then(parsers.parse('the device log should show matter "{param}" set to "{value}"'))
def verify_matter_serial(matter_device, param, value):
    if param == "OnOff":
        target = "to 0" if value == "off" else "to 1"
        assert matter_device.wait_for_serial_since(target, contains="on/off", timeout=30), \
            f"Device serial did not confirm matter OnOff set to {value}"
    elif param == "Brightness":
        level = round(int(value) * 254 / 100)
        assert matter_device.wait_for_serial_number_since("MOVE_TO_LEVEL_WITH_ON_OFF", level, tol=15, base=16, timeout=30), \
            f"Device serial did not report Matter level ~{level}/254 for Brightness {value}%"
    elif param == "CCT":
        mireds = round(1000000 / int(value))
        assert matter_device.wait_for_serial_number_since(
            "Color Temperature", mireds, tol=15, base=10, timeout=30), \
            f"Device serial did not report colour temperature ~{mireds} mireds ({value}K)"
    else:
        raise AssertionError(f"Unsupported matter serial param: {param}")


@when(parsers.parse('user sets matter "{param}" to "{value}" from the matter control screen'))
def matter_set_param(helper, matter_device, matter_light_name, param, value):
    helper.home.go_home()
    helper.home.open_device(matter_light_name)
    matter_device.mark_serial()
    helper.control.set_slider(param, value)


@then(parsers.parse('the matter control screen should read "{param}" as "{value}"'))
def matter_verify_param(helper, param, value):
    tol = 200 if param == "CCT" else 5
    actual = helper.control.read_slider_value(param)
    assert actual is not None and abs(int(actual) - int(value)) <= tol, \
        f"Control screen {param} read {actual}, expected ~{value}"
