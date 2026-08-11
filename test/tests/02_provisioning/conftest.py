# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Shared BDD steps for all provisioning suites (scan QR, Bluetooth, SoftAP,
on-network): hardware allocation, flashing, navigation, Wi-Fi entry and the
post-provision continue chain.
"""
import json
import logging
import time
from dataclasses import replace
from pathlib import Path

import pytest
from pytest_bdd import given, parsers, then, when

from hardware import record_hardware_report
from hardware.exceptions import SerialLogError
from hardware.models import ResourceStatus
from hardware.qr import QrPayloadExtractor
from hardware.requirements import HardwareRequirement
from utils.common_utils import normalize_input
from utils.registered_user_resolver import deployment_type

logger = logging.getLogger(__name__)

CONTINUE_LOAD_TIME = 1


def _tap_continue_for_current_screen(helper):
    """Tap Continue on whichever post-provision screen is currently visible."""
    continue_screens = (
        (helper.provision, helper.provision.tap_continue),
        (helper.name_device, helper.name_device.tap_continue),
        (helper.add_to_room, helper.add_to_room.tap_continue),
        (helper.guide, helper.guide.tap_continue),
    )
    for page, tap_continue in continue_screens:
        if page.check_screen_displayed(timeout=0.5, quiet=True):
            tap_continue()
            return
    # "guide" screen is optional and configurable: nothing to continue.
    if helper.home.check_screen_displayed(timeout=2, quiet=True):
        return
    raise AssertionError("Continue button is not available on the current screen")


def _parse_compact_prov_payload(payload):
    """Compat shim for the shared QR payload parser (JSON or compact NP:/RM:)."""
    return QrPayloadExtractor.parse(payload)


@pytest.fixture
def capture_device_prov_info(hardware_session, resource_manager):
    """
    Callable fixture: parse the provisioning payload (name / pop / transport)
    from serial logs. The firmware prints the QR payload JSON on boot; it
    identifies the device in BLE/SoftAP scan lists and carries the PoP code.
    """

    def capture(timeout=60, required=True):
        """
        @param required - When False, return {} instead of raising if no payload
                          appears (SoftAP/on-network can select the device from
                          the in-app scan list without the serial name).
        """
        resource = hardware_session["resource"]
        log_path = Path(resource.serial_log_path) if resource.serial_log_path else None
        assert log_path, "Serial logging is not active; flash the device first"

        live_lines = resource_manager.serial_logger.get_live_lines(resource)
        try:
            payload = QrPayloadExtractor.from_log_file(log_path, timeout=timeout, poll_lines=live_lines)
        except SerialLogError:
            if required:
                raise
            logger.warning("No provisioning payload in serial log; continuing without device name")
            hardware_session["prov_info"] = {}
            return {}
        resource.qr_payload = payload
        try:
            info = json.loads(payload)
        except (TypeError, ValueError):
            info = _parse_compact_prov_payload(payload)
        hardware_session["prov_info"] = info
        logger.info(
            "Provisioning payload captured: name=%s transport=%s pop=%s",
            info.get("name"), info.get("transport"), "set" if info.get("pop") else "none",
        )
        return info

    return capture


@given(parsers.parse('an "{chip_label}" device'))
def given_esp_device(request, hardware_session, resource_manager, chip_label):
    """Allocate ESP hardware matching the chip declared in the feature file."""
    requirement = HardwareRequirement(chip_type=chip_label, deployment=deployment_type(request.config.getoption("--deployment")))
    hardware_session["requirement"] = requirement
    resource = resource_manager.acquire(
        chip_type=requirement.chip_type,
        test_name=hardware_session["test_name"],
    )
    hardware_session["resource"] = resource
    hardware_session.setdefault("resources", []).append(resource)


@given("the device is hard reset")
def hard_reset_device(hardware_session, resource_manager):
    """Hard reset the allocated ESP device."""
    resource = hardware_session["resource"]
    assert resource, "Allocate device before hard reset"
    resource_manager.update_status(resource.mac_address, ResourceStatus.IN_USE)
    resource_manager.flasher.hard_reset(resource)


def _flash_device(request, hardware_session, resource_manager, product, transport, chal_resp):
    """Validate firmware metadata and flash the device per scenario requirements.

    @param chal_resp - require (True) / forbid (False) / ignore (None) the
        local-control challenge-response firmware build. on-network discovery
        needs True; it's otherwise indistinguishable from the plain BLE build.
    """
    requirement = hardware_session["requirement"]
    assert requirement, "Device requirement missing from feature background"
    requirement = replace(requirement, product=product, prov_mode=transport, chal_resp=chal_resp)
    hardware_session["requirement"] = requirement

    metadata = resource_manager.firmware.load_metadata(requirement)
    resource_manager.firmware.validate(requirement, metadata)
    hardware_session["build_metadata"] = metadata

    firmware_image = resource_manager.firmware.resolve_image(requirement, metadata)
    hardware_session["firmware_image"] = firmware_image

    resource = hardware_session["resource"]
    artifact_dir = hardware_session["artifact_dir"]
    resource_manager.update_status(resource.mac_address, ResourceStatus.FLASHING)
    resource_manager.serial_logger.stop(resource)
    resource_manager.flasher.prepare_certs(resource, request.config.getoption("--deployment"), firmware_image)
    resource_manager.flasher.flash(resource, firmware_image)
    resource_manager.flasher.hard_reset(resource, firmware_image)
    resource.build_metadata = metadata
    record_hardware_report(request, resource, metadata)

    log_path = artifact_dir.serial_log_path(resource)
    resource_manager.serial_logger.start(
        resource, log_path, wait_for_port=True, trigger_reset=True
    )
    assert resource_manager.serial_logger.wait_for_bytes(resource, min_bytes=100, timeout=20), (
        f"No UART output on {resource.port} after flash"
    )
    request.node._chip_serial_log_path = str(log_path)


@when(parsers.parse('the device is flashed with "{product}", "{transport}" transport'))
def flash_device(request, hardware_session, resource_manager, product, transport):
    """Flash the plain scenario firmware (no challenge-response constraint)."""
    _flash_device(request, hardware_session, resource_manager, product, transport, chal_resp=None)


@when(parsers.parse('the device is flashed with "{product}", "{transport}" transport with challenge-response'))
def flash_device_chal_resp(request, hardware_session, resource_manager, product, transport):
    """Flash the local-control challenge-response firmware (on-network discovery)."""
    _flash_device(request, hardware_session, resource_manager, product, transport, chal_resp=True)


@when(parsers.parse('user taps "{button_name}"'))
def tap_button(helper, button_name):
    if button_name == "add device":
        helper.add_device.open_from_home()
    elif button_name == "bluetooth":
        helper.add_device.select_bluetooth_option()
    elif button_name == "softap":
        helper.add_device.select_soft_ap_option()
    elif button_name == "on network":
        helper.add_device.select_on_network_option()
    elif button_name == "join other network":
        helper.connect_wifi.open_join_other_network_modal()
    elif button_name == "connect":
        helper.connect_wifi.connect_join_network()
    elif button_name == "continue":
        _tap_continue_for_current_screen(helper)
        time.sleep(CONTINUE_LOAD_TIME)
    else:
        raise AssertionError(f"Unsupported button: {button_name}")


@when(parsers.parse('user enters "{ssid_key}" and "{password_key}"'))
def enter_wifi_credentials(helper, ssid_key, password_key, provision_config_resolver):
    ssid = provision_config_resolver(ssid_key)
    password = provision_config_resolver(password_key)
    helper.connect_wifi.enter_join_network_credentials(ssid, password)


@when(parsers.parse('user renames the device name to "{device_name}"'))
def rename_device(helper, device_name):
    helper.name_device.rename_device(normalize_input(device_name))


@when(parsers.parse('user adds device to "{room_type}" room "{room_name}"'))
def add_device_to_room(helper, room_type, room_name):
    if room_type == "existing":
        helper.add_to_room.select_existing_room(normalize_input(room_name))
    elif room_type == "skip":
        helper.add_to_room.skip()
    else:
        raise AssertionError(f"Unsupported room type: {room_type}")


@when("user skips adding the device to a room")
def skip_add_to_room(helper):
    """Skip room assignment — CI accounts may not have the expected rooms."""
    helper.add_to_room.skip()


@when("user enters the device pop")
def enter_device_pop(helper, hardware_session):
    """Enter the proof of possession captured from the device serial logs."""
    pop = (hardware_session.get("prov_info") or {}).get("pop", "")
    if not pop:
        pytest.fail("PoP missing from provisioning payload. Check serial logs.")
    helper.pop.enter_pop(pop)


@then("user should be on add device selection screen")
def should_be_on_add_device_selection_screen(helper):
    helper.add_device.open_selection_from_scanner()
    assert helper.add_device.check_screen_displayed(), "Should be on add device selection screen"


@then("user should be on pop screen")
def should_be_on_pop_screen(helper):
    assert helper.pop.check_screen_displayed(timeout=7), "Should be on proof of possession screen"


@then("user should be on connect wifi screen")
def should_be_on_connect_wifi_screen(helper):
    assert helper.connect_wifi.check_screen_displayed(timeout=7), "Should be on connect wifi screen"


@then("user should be on provisioning page")
def should_be_on_provisioning_page(helper):
    assert helper.provision.check_screen_displayed(timeout=5), "Should be on provisioning page"


@then("user should see all steps successful")
def all_provisioning_steps_successful(helper):
    helper.provision.assert_all_steps_successful()


@then("user should see device provisioned successfully toast")
def provisioning_success_toast(helper):
    helper.provision.assert_success_toast("Device provisioned successfully")


@then(parsers.parse('continue button should be "{state}"'))
def continue_button_should_be(helper, state):
    if state == "enabled":
        assert helper.provision.is_enabled("continue_button", timeout=2), f"Continue button should be {state}"
    elif state == "disabled":
        assert not helper.provision.is_enabled("continue_button", timeout=2), f"Continue button should be {state}"
    else:
        raise AssertionError(f"Unsupported state: {state}")


@then("user should be on name device screen")
def should_be_on_name_device_screen(helper):
    assert helper.name_device.check_screen_displayed(timeout=5), "Should be on name device screen"


@then("user should be on add to room screen")
def should_be_on_add_to_room_screen(helper):
    assert helper.add_to_room.check_screen_displayed(timeout=5), "Should be on add to room screen"


@then("user should be on guide screen")
def should_be_on_guide_screen(helper):
    # The "guide" screen is optional
    if helper.guide.check_screen_displayed(timeout=5):
        return
    assert helper.home.check_screen_displayed(timeout=5), \
        "Should be on guide screen (or home)"


@then(parsers.parse('device "{device_name}" should be visible on home screen'))
def device_should_be_visible_on_home(helper, device_name):
    assert helper.home.is_device_visible(normalize_input(device_name), timeout=10), (
        f"Device '{device_name}' should be visible on home screen"
    )
