# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
BDD tests for Bluetooth (BLE) provisioning flow.

Shared provisioning steps live in tests/02_provisioning/conftest.py.
"""
import logging

import pytest
from pytest_bdd import scenarios, then, when

logger = logging.getLogger(__name__)
pytestmark = [pytest.mark.regression, pytest.mark.provisioning]

scenarios("bluetooth.feature")


@then("user should be on scan bluetooth screen")
def should_be_on_scan_ble_screen(helper):
    assert helper.scan_ble.check_screen_displayed(timeout=10), "Should be on scan bluetooth screen"


@when("user selects the discovered ble device")
def select_discovered_ble_device(helper, capture_device_prov_info):
    """Select the BLE device advertised with the name from the serial payload."""
    info = capture_device_prov_info()
    helper.scan_ble.select_device(info.get("name"))


@then("scan bluetooth screen elements should be present")
def scan_ble_elements_present(helper):
    helper.scan_ble.grant_runtime_permissions_if_needed()
    helper.scan_ble.validate_screen_elements()


@when("user recovers to the pop screen for the discovered ble device")
def recover_to_pop_screen(helper, capture_device_prov_info):
    if helper.pop.check_screen_displayed(timeout=3):
        return
    helper.home.go_home()
    helper.home.open_add_device()
    helper.add_device.open_selection_from_scanner()
    helper.add_device.select_bluetooth_option()
    info = capture_device_prov_info()
    helper.scan_ble.select_device(info.get("name"))
    assert helper.pop.check_screen_displayed(timeout=10), "Could not recover to the proof of possession screen"
