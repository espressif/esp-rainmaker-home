# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
BDD tests for Scan QR provisioning flow.

Shared provisioning steps (hardware allocation, flashing, Wi-Fi entry,
post-provision chain) live in tests/02_provisioning/conftest.py.
"""
import logging
import time
from pathlib import Path

import pytest
from pytest_bdd import scenarios, then, when

from hardware.models import ResourceStatus
from hardware.qr import QrDisplay, QrPayloadExtractor
from utils.app_copy import app_i18n

logger = logging.getLogger(__name__)
pytestmark = [pytest.mark.regression, pytest.mark.provisioning]

scenarios("scan_qr.feature")


@then("device provisioning qr should be displayed for scan")
def provisioning_qr_displayed(hardware_session, resource_manager, request, helper):
    """Extract QR payload from serial logs and display PNG for camera scan."""
    resource = hardware_session["resource"]
    artifact_dir = hardware_session["artifact_dir"]
    platform = helper.driver._test_info.get("platform", "android")
    log_path = Path(resource.serial_log_path) if resource.serial_log_path else artifact_dir.serial_log_path(resource)

    if not resource_manager.serial_logger.is_active(resource):
        resource_manager.serial_logger.start(
            resource, log_path, wait_for_port=False, trigger_reset=True
        )

    resource_manager.serial_logger.wait_for_bytes(resource, min_bytes=100, timeout=30)
    live_lines = resource_manager.serial_logger.get_live_lines(resource)
    payload = QrPayloadExtractor.from_log_file(log_path, timeout=60, poll_lines=live_lines)
    resource.qr_payload = payload
    resource_manager.update_status(resource.mac_address, ResourceStatus.PROVISIONING)

    png_path = QrDisplay.show(payload, artifact_dir.root, platform=platform)
    assert png_path.is_file() and png_path.stat().st_size > 0, (
        f"provision_qr.png missing in {artifact_dir.root}"
    )
    logger.info("Provisioning QR displayed: %s (platform=%s)", png_path, platform)
    request.node._chip_serial_log_path = str(log_path)


@when("user scans the qr code")
def scan_qr_code(helper, hardware_session):
    """Trigger QR scan using payload captured from serial logs."""
    resource = hardware_session.get("resource")
    if not resource or not resource.qr_payload:
        pytest.fail("QR payload missing. Ensure serial logging captured provisioning output.")
    helper.scan_qr.perform_qr_scan()
    scanned = helper.connect_wifi.check_screen_displayed(timeout=10)
    QrDisplay.close()
    assert scanned, (
        "QR scan did not navigate to the Wi-Fi screen — the camera did not read the QR "
        "(check the Preview window position on the rig display). Aborting instead of looping."
    )


@then("user should be on scan qr screen")
def should_be_on_scan_qr_screen(helper):
    assert helper.scan_qr.check_screen_displayed(timeout=5), "Should be on scan qr screen"


@then("scan qr screen elements should be present")
def scan_qr_elements_present(helper):
    """Validate Scan QR shell and scanner overlay elements (raises on missing)."""
    helper.scan_qr.grant_runtime_permissions_if_needed()
    helper.scan_qr.validate_baseline_elements()
    helper.scan_qr.validate_scanner_elements()


@when("a corrupted provisioning qr is displayed for scan")
def corrupted_qr_displayed(hardware_session, helper):
    artifact_dir = hardware_session["artifact_dir"]
    platform = helper.driver._test_info.get("platform", "android")
    png_path = QrDisplay.show("CORRUPTED-PAYLOAD-NOT-A-PROVISIONING-QR-0123456789", artifact_dir.root, platform=platform)
    assert png_path.is_file() and png_path.stat().st_size > 0


@when("a softap provisioning qr is displayed for scan")
def softap_qr_displayed(hardware_session, helper):
    artifact_dir = hardware_session["artifact_dir"]
    platform = helper.driver._test_info.get("platform", "android")
    payload = '{"ver":"v1","name":"PROV_softap","username":"wifiprov","pop":"abcd1234","transport":"softap"}'
    png_path = QrDisplay.show(payload, artifact_dir.root, platform=platform)
    assert png_path.is_file() and png_path.stat().st_size > 0


@then("the app should reject the softap provisioning qr")
def softap_qr_rejected(helper):
    expected = app_i18n("device.scan.qr.softAPNotSupported")
    deadline = time.time() + 20
    seen = []
    while time.time() < deadline:
        title, _ = helper.scan_qr.get_toast_title_and_message(timeout=3, require_message=False)
        if title == expected:
            return
        if title and title not in seen:
            seen.append(title)
        time.sleep(0.5)
    raise AssertionError(f"SoftAP rejection toast {expected!r} not shown; toasts seen: {seen or 'none'}")


@then("user should remain on the scan qr screen")
def remains_on_scan_qr(helper):
    deadline = time.time() + 8
    while time.time() < deadline:
        assert helper.scan_qr.check_screen_displayed(timeout=2), "App left the Scan QR screen for a corrupted QR"
        time.sleep(2)
