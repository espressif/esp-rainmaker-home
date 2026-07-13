# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""BDD tests for Matter commissioning via the Google Play services half-sheet (setup in this section's conftest.py)."""
import logging

import pytest
from pytest_bdd import scenarios, when, then, parsers

logger = logging.getLogger(__name__)
pytestmark = [pytest.mark.regression, pytest.mark.provisioning]

scenarios("matter.feature")


@when(parsers.parse('user adds a device via "{method}"'))
def add_device_via(helper, method):
    helper.add_device.open_from_home()
    if method == "scan qr":
        helper.add_device.select_scan_qr_option()
    else:
        raise AssertionError(f"Unsupported matter add-device method: {method}")


@when("user completes the Google Play services commissioning")
def complete_gps_commissioning(helper):
    helper.matter_commissioning.complete_commissioning()


@then("the matter device should be commissioned successfully")
def matter_commissioned(matter_device):
    assert matter_device.wait_for_serial("Commissioning Complete", timeout=120), \
        "Device serial did not report commissioning completion"


@then("the home screen should show a matter device")
def matter_device_on_home(helper):
    helper.home.go_home()
    assert helper.home.is_visible("device_names_text", timeout=30), \
        "No device shown on the home screen after commissioning"


@then("the home screen should show the matter device as locally reachable")
def matter_device_local(helper):
    helper.home.go_home()
    assert helper.home.is_local_control_badge_visible(timeout=90), \
        "Matter device not shown as locally reachable (Available on WLAN) on the home screen"


@when(parsers.parse('user toggles the matter device power "{state}" from the home screen'))
def toggle_matter_power(helper, matter_device, state):
    helper.home.go_home()
    matter_device.mark_serial()
    helper.home.set_card_power("Light", state == "on")


@then(parsers.parse('the device log should show matter "OnOff" set to "{state}"'))
def verify_matter_onoff(matter_device, state):
    target = "to 0" if state == "off" else "to 1"
    assert matter_device.wait_for_serial_since(target, contains="on/off", timeout=30), \
        f"Device serial did not confirm matter OnOff set to {state}"
