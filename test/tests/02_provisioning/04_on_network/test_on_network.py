# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
BDD tests for on-network (mDNS) provisioning flow.

The background hard-reset clears the nvs partition, so the device boots into
provisioning mode with no Wi-Fi credentials. To bring it onto the lab network
without app provisioning, we push credentials over the serial console with the
RainMaker `wifi-prov <ssid> <passphrase>` command, then wait for an IP.

Precondition: RainMaker on-network (local-control) discovery only lists nodes
already associated with the signed-in user. A node that was never associated
will join Wi-Fi but not appear in the app's discovery — provision it once
(BLE/SoftAP) under this user before relying on this suite.

Shared provisioning steps live in tests/02_provisioning/conftest.py.
"""
import logging
import re
import time
from pathlib import Path

import pytest
from pytest_bdd import scenarios, then, when

logger = logging.getLogger(__name__)
pytestmark = [pytest.mark.regression, pytest.mark.provisioning, pytest.mark.on_network]

scenarios("on_network.feature")

# Definitive station-got-IP markers only — avoid loose tokens like "ip:" that
# match unrelated boot output and falsely report the device as already online.
_WIFI_CONNECTED_MARKERS = ("sta_got_ip", "esp_netif_handlers: sta ip:", "wifi:connected to")
_CONSOLE_READY_MARKERS = ("provisioning started", "wifi-prov", "esp-rmaker", "main_task")
# The local-control mDNS service only starts once the provisioning/BLE window
# closes (~30-40s after boot). chal-resp-enable returns "Local control service
# not started" if sent before this line appears, so wait for it first.
_LOCAL_CTRL_STARTED_MARKERS = ("esp_local_ctrl service started",)


# The node's local-control session uses security_1 with its OWN POP (separate
# from the BLE provisioning PoP), printed in the params report, e.g.
# "Local Control":{"POP":"0ba78da8","Type":1}. The app must enter this POP for
# the on-network session, or security_1 fails with "Key mismatch".
_LOCAL_CTRL_POP_RE = re.compile(r'"Local Control":\s*\{[^}]*"POP":"([^"]+)"')
_NODE_ID_RE = re.compile(r'Node ID -----\s*(\S+)')


def _log_offset(log_path):
    """Current size of the serial log so later waits can scan only new output."""
    path = Path(log_path)
    return path.stat().st_size if path.exists() else 0


def _local_ctrl_pop(log_path):
    """
    Parse the node's local-control POP from its params report in serial.

    reset-to-factory makes the node regenerate this POP, so the log can hold an
    earlier boot's stale value — take the last match (the current boot).
    """
    path = Path(log_path)
    if not path.exists():
        return ""
    matches = _LOCAL_CTRL_POP_RE.findall(path.read_text(errors="replace"))
    return matches[-1] if matches else ""


def _new_serial_text(log_path, since_offset):
    """Lower-cased serial output appended to the log after `since_offset`."""
    path = Path(log_path)
    if not path.exists():
        return ""
    with open(path, "r", errors="replace") as handle:
        handle.seek(since_offset)
        return handle.read().lower()


def _wait_for(resource_manager, resource, log_path, markers, timeout, since_offset=0):
    """
    Wait until any marker appears in serial output written after `since_offset`.

    The log accumulates every boot in a run, so matching the whole file gives
    false positives (a stale 'sta ip:' from an earlier boot). Scanning only new
    output makes each wait reflect the current command, and keeps console
    commands from being fired back-to-back (which concatenates them on the wire).
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        if any(marker in _new_serial_text(log_path, since_offset) for marker in markers):
            return True
        time.sleep(2)
    return False


@when("the device is online on the local network")
def device_online_on_network(hardware_session, resource_manager, request, hardware_config):
    """
    Bring the device online via the serial `wifi-prov` console command.

    After the background hard-reset the device has no Wi-Fi credentials, so we
    push the lab SSID/passphrase over UART and wait for an IP.
    """
    resource = hardware_session["resource"]
    artifact_dir = hardware_session["artifact_dir"]
    log_path = artifact_dir.serial_log_path(resource)

    if not resource_manager.serial_logger.is_active(resource):
        resource_manager.serial_logger.start(
            resource, log_path, wait_for_port=False, trigger_reset=True
        )
    request.node._chip_serial_log_path = str(log_path)

    _wait_for(resource_manager, resource, log_path, _CONSOLE_READY_MARKERS, timeout=30)

    ssid = hardware_config.ssid
    password = hardware_config.ssid_password
    assert ssid, "wifi.ssid is empty in esp_devices.yaml"
    offset = _log_offset(log_path)
    resource_manager.serial_logger.send_command(resource, f"wifi-prov {ssid} {password}".strip())
    logger.info("Pushed wifi-prov for SSID '%s' over serial console", ssid)
    if not _wait_for(resource_manager, resource, log_path, _WIFI_CONNECTED_MARKERS, timeout=60, since_offset=offset):
        pytest.skip(
            "Device did not obtain an IP after serial 'wifi-prov'. Ensure the "
            "Wi-Fi (esp_devices.yaml) is on-air and reachable with internet so "
            "the node can self-claim, or pre-provision the device onto the network."
        )
    logger.info("Device is online on the local network")

    # chal-resp-enable only works once esp_local_ctrl has started (it stays down
    # until the provisioning/BLE window closes, ~30-40s after the join). Sending
    # it earlier returns "Local control service not started" and the mapping
    # window never opens, so the app discovers nothing.
    if not _wait_for(resource_manager, resource, log_path, _LOCAL_CTRL_STARTED_MARKERS, timeout=60, since_offset=offset):
        pytest.skip(
            "esp_local_ctrl service did not start within 60s; cannot open the "
            "challenge-response mapping window for on-network discovery."
        )

    # Open the node-mapping window for the app's challenge-response handshake.
    # Retry until the console stops reporting the service as not-started.
    for attempt in range(5):
        cmd_offset = _log_offset(log_path)
        resource_manager.serial_logger.send_command(resource, "chal-resp-enable")
        time.sleep(3)
        if "local control service not started" not in _new_serial_text(log_path, cmd_offset):
            logger.info("chal-resp-enable accepted (attempt %s)", attempt + 1)
            break
        logger.warning("chal-resp-enable not yet accepted, retrying")
    logger.info("Opened the on-network challenge-response mapping window")
    time.sleep(3)  # let the mDNS chal-resp service advertise

    # The app's PoP screen for the local-control session needs the node's
    # local-control POP (security_1), not the BLE provisioning PoP. Capture it
    # from serial so POP screen submits the right code.
    pop = ""
    pop_deadline = time.time() + 30
    while time.time() < pop_deadline:
        pop = _local_ctrl_pop(log_path)
        if pop:
            break
        time.sleep(2)
    if pop:
        info = dict(hardware_session.get("prov_info") or {})
        info["pop"] = pop
        node_ids = _NODE_ID_RE.findall(Path(log_path).read_text(errors="replace"))
        if node_ids:
            info["node_id"] = node_ids[-1]
        hardware_session["prov_info"] = info
        logger.info("Captured local-control POP for the on-network session")
    else:
        logger.warning("Local-control POP not found in serial; PoP step may fail")


@then("user should be on discover devices screen")
def should_be_on_discover_devices_screen(helper):
    assert helper.on_network.check_screen_displayed(timeout=5), "Should be on discover devices screen"


@when("user selects the discovered on-network device")
def select_discovered_on_network_device(helper, hardware_session):
    """Select the device under test by node id"""
    hardware_session["pop_required"] = helper.on_network.is_pop_required(timeout=3)
    node_id = (hardware_session.get("prov_info") or {}).get("node_id")
    if node_id:
        helper.on_network.select_device_by_node_id(node_id)
    else:
        helper.on_network.select_first_device()


@then("discover devices screen elements should be present")
def discover_devices_elements_present(helper):
    helper.on_network.validate_screen_elements()
