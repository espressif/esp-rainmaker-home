# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Stress and resilience BDD tests for provisioning: configurable-scale repeated
provisioning of one chip, and recovery from app-level disruptions mid-flow.

Shared provisioning steps live in tests/02_provisioning/conftest.py.
"""
import logging
import time

import pytest
from pytest_bdd import parsers, scenarios, then, when

logger = logging.getLogger(__name__)
pytestmark = [pytest.mark.regression, pytest.mark.provisioning]

scenarios("stress.feature")


@then("user should be on scan bluetooth screen")
def should_be_on_scan_ble_screen(helper):
    assert helper.scan_ble.check_screen_displayed(timeout=10), "Should be on scan bluetooth screen"


@when("user selects the discovered ble device")
def select_discovered_ble_device(helper, capture_device_prov_info):
    """Select the BLE device advertised with the name from the serial payload."""
    info = capture_device_prov_info()
    helper.scan_ble.select_device(info.get("name"))


def _reset_for_next_provisioning(hardware_session, resource_manager):
    resource = hardware_session["resource"]
    artifact_dir = hardware_session["artifact_dir"]
    resource_manager.serial_logger.stop(resource)
    resource_manager.flasher.hard_reset(resource, hardware_session.get("firmware_image"))
    log_path = artifact_dir.serial_log_path(resource)
    resource_manager.serial_logger.start(resource, log_path, wait_for_port=True, trigger_reset=True)
    assert resource_manager.serial_logger.wait_for_bytes(resource, min_bytes=100, timeout=20), (
        f"No UART output on {resource.port} after reset"
    )


def _ble_provision_once(helper, capture_device_prov_info, provision_config_resolver, device_name):
    info = capture_device_prov_info()
    helper.home.go_home()
    helper.add_device.open_from_home()
    helper.add_device.open_selection_from_scanner()
    helper.add_device.select_bluetooth_option()
    helper.scan_ble.select_device(info.get("name"))
    assert helper.pop.check_screen_displayed(timeout=10), "PoP screen not shown"
    helper.pop.enter_pop(info.get("pop", ""))
    assert helper.connect_wifi.check_screen_displayed(timeout=20), "Connect Wi-Fi screen not shown"
    helper.connect_wifi.open_join_other_network_modal()
    helper.connect_wifi.enter_join_network_credentials(
        provision_config_resolver("ssid"), provision_config_resolver("ssid_password"))
    helper.connect_wifi.connect_join_network()
    assert helper.provision.check_screen_displayed(timeout=20), "Provisioning page not shown"
    assert helper.provision.assert_all_steps_successful(timeout=75)
    helper.provision.click("continue_button", timeout=10)
    assert helper.name_device.check_screen_displayed(timeout=20), "Name screen not shown"
    helper.name_device.rename_device(device_name)
    helper.name_device.click("continue_button", timeout=10)
    assert helper.add_to_room.check_screen_displayed(timeout=45), "Add-to-room screen not shown"
    helper.add_to_room.skip()
    if helper.guide.check_screen_displayed(timeout=10):
        helper.guide.tap_continue()
    assert helper.home.is_device_visible(device_name, timeout=15, attempts=2), (
        f"{device_name} not visible on home after provisioning"
    )


@then("the device provisions successfully over BLE for every scale iteration")
def provision_at_scale(helper, hardware_session, resource_manager, capture_device_prov_info,
                       provision_config_resolver, request):
    count = request.config.getoption("--scale-count")
    for iteration in range(1, count + 1):
        logger.info("Scale provisioning iteration %s/%s", iteration, count)
        if iteration > 1:
            _reset_for_next_provisioning(hardware_session, resource_manager)
        _ble_provision_once(helper, capture_device_prov_info, provision_config_resolver,
                            f"Scale Light {iteration}")


@when("the app is killed and relaunched")
def kill_and_relaunch_app(helper):
    caps = helper.driver.capabilities
    app_id = caps.get("appPackage") or caps.get("bundleId")
    assert app_id, "Cannot determine the app id from driver capabilities"
    helper.driver.terminate_app(app_id)
    time.sleep(3)
    helper.driver.activate_app(app_id)


@then("the device provisions successfully over BLE once more")
def provision_once_more(helper, hardware_session, resource_manager, capture_device_prov_info,
                        provision_config_resolver):
    _reset_for_next_provisioning(hardware_session, resource_manager)
    _ble_provision_once(helper, capture_device_prov_info, provision_config_resolver, "Recovered Light")


@when(parsers.parse('the app is backgrounded for "{seconds:d}" seconds'))
def background_app(helper, seconds):
    helper.driver.background_app(seconds)
