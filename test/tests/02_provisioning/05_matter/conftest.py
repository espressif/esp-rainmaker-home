# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Matter commissioning device setup — dedicated chip flashed with the auto-updated esp-matter light image + a unique per-run factory partition (dynamic QR)."""
import logging
import os
import random
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest
from pytest_bdd import given, parsers

from hardware.qr import QrDisplay
from hardware.serial import _SerialCapture
from scripts.download_firmwares import download_matter_image

logger = logging.getLogger(__name__)

MATTER_CHIP_MAC = os.getenv("MATTER_CHIP_MAC")
# Optional static override: set BOTH to skip the dynamic download + factory
# generation and commission with a fixed image/payload instead.
MATTER_FW_BIN = os.getenv("MATTER_FW_BIN")
MATTER_QR = os.getenv("MATTER_QR")
COMMISSIONING_WINDOW_MARKER = "Commissioning window opened"
MATTER_DEVICE_NAME = os.getenv("MATTER_DEVICE_NAME", "Light")
MATTER_TEST_VENDOR_ID = int(os.getenv("MATTER_TEST_VENDOR_ID", "65521"))   # 0xFFF1 test VID
MATTER_TEST_PRODUCT_ID = int(os.getenv("MATTER_TEST_PRODUCT_ID", "32768"))  # 0x8000

# Matter spec: passcode is 1..99999998 excluding the trivially-guessable set.
_INVALID_PASSCODES = {
    0, 11111111, 22222222, 33333333, 44444444, 55555555,
    66666666, 77777777, 88888888, 99999999, 12345678, 87654321,
}


def _find_partitions(image_path):
    """Parse the merged image's embedded partition table; return {label: (offset, size)}."""
    image = Path(image_path).read_bytes()
    for table_offset in (0x8000, 0x9000, 0xC000, 0xD000, 0x10000):
        entries = {}
        for index in range(95):
            start = table_offset + index * 32
            entry = image[start:start + 32]
            if len(entry) < 32 or entry[0:2] != b"\xaa\x50":
                break
            part_offset = int.from_bytes(entry[4:8], "little")
            part_size = int.from_bytes(entry[8:12], "little")
            label = entry[12:28].split(b"\x00", 1)[0].decode(errors="replace")
            entries[label] = (part_offset, part_size)
        if entries:
            logger.info("Partition table @0x%x: %s", table_offset, {k: hex(v[0]) for k, v in entries.items()})
            return entries
    raise RuntimeError("No partition table found in the merged image (scanned 0x8000/0x9000/0xc000/0xd000/0x10000)")


def _mfg_tool_path():
    """The esp-matter-mfg-tool console script (venv first, then PATH)."""
    candidate = Path(sys.executable).parent / "esp-matter-mfg-tool"
    if candidate.exists():
        return str(candidate)
    found = shutil.which("esp-matter-mfg-tool")
    if found:
        return found
    raise RuntimeError("esp-matter-mfg-tool not found (pip install esp-matter-mfg-tool)")


def _generate_factory(workdir):
    """Run esp-matter-mfg-tool with a random valid discriminator/passcode; return {fctry_bin, qr, discriminator, passcode}."""
    discriminator = random.randint(0, 0xFFF)
    passcode = 0
    while passcode in _INVALID_PASSCODES:
        passcode = random.randint(1, 99999998)
    workdir.mkdir(parents=True, exist_ok=True)
    cmd = [
        _mfg_tool_path(),
        "--discriminator", str(discriminator),
        "--passcode", str(passcode),
        "--vendor-id", str(MATTER_TEST_VENDOR_ID),
        "--product-id", str(MATTER_TEST_PRODUCT_ID),
    ]
    logger.info("Generating factory partition: %s", " ".join(cmd))
    result = subprocess.run(cmd, cwd=workdir, capture_output=True, text=True, timeout=180)
    if result.returncode != 0:
        raise RuntimeError(f"esp-matter-mfg-tool failed: {result.stdout[-400:]}\n{result.stderr[-400:]}")

    partition_bins = sorted((workdir / "out").rglob("*-partition.bin"), key=lambda p: p.stat().st_mtime)
    if not partition_bins:
        raise RuntimeError(f"mfg-tool produced no *-partition.bin under {workdir / 'out'}")
    fctry_bin = partition_bins[-1]

    qr = None
    for text_file in sorted(fctry_bin.parent.glob("*")):
        if text_file.suffix.lower() in (".csv", ".json", ".txt"):
            for token in text_file.read_text(errors="replace").replace(",", "\n").split():
                if token.startswith("MT:"):
                    qr = token.strip().strip('"')
    if not qr:
        raise RuntimeError(f"No MT: payload found next to {fctry_bin}")
    return {"fctry_bin": str(fctry_bin), "qr": qr, "discriminator": discriminator, "passcode": passcode}


def _prepare_dynamic_firmware(workdir):
    """Download the auto-updated image + generate unique commissionable data; the NVS is injected at BOTH the `nvs` (demo builds read chip-factory there — verified on-device) and `fctry` (factory-data-provider builds) offsets."""
    merged = download_matter_image()
    partitions = _find_partitions(merged)
    targets = [(label,) + partitions[label] for label in ("nvs", "fctry") if label in partitions]
    if not targets:
        raise RuntimeError(f"Neither 'nvs' nor 'fctry' partition in the image; labels: {list(partitions)}")
    factory = _generate_factory(Path(workdir))
    factory_len = Path(factory["fctry_bin"]).stat().st_size
    for label, offset, size in targets:
        if factory_len > size:
            raise RuntimeError(f"Generated factory bin (0x{factory_len:x}) exceeds '{label}' partition (0x{size:x})")
    return {"merged_bin": str(merged), "inject_offsets": [offset for _, offset, _ in targets], **factory}


class MatterDevice:
    """Owns the Matter chip's serial log for verification and reset."""

    def __init__(self, port, log_path):
        self.port = port
        self.mac_address = MATTER_CHIP_MAC
        self.log_path = log_path
        self._capture = None
        self._since = 0

    def start_capture(self, trigger_reset=True):
        self._capture = _SerialCapture(self.port, self.log_path, trigger_reset=trigger_reset)
        self._capture.start()
        self._capture.wait_until_ready(12)

    def lines(self):
        try:
            return self.log_path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            return list(self._capture.lines) if self._capture else []

    def mark_serial(self):
        self._since = len(self.lines())

    def wait_for_serial(self, needle, timeout=60):
        deadline = time.time() + timeout
        while time.time() < deadline:
            if any(needle in line for line in self.lines()):
                return True
            time.sleep(1)
        return False

    def wait_for_serial_since(self, needle, contains=None, timeout=30):
        deadline = time.time() + timeout
        while time.time() < deadline:
            for line in self.lines()[self._since:]:
                if needle in line and (contains is None or contains in line):
                    return True
            time.sleep(1)
        return False

    def factory_reset(self):
        if self._capture:
            self._capture.write_line("matter esp factoryreset")
            time.sleep(3)

    def stop(self):
        if self._capture:
            self._capture.stop()


def _flash_matter_image(port, fw, inject=None):
    fw = Path(fw)
    if not fw.is_absolute():
        fw = Path(__file__).resolve().parents[3] / fw
    if not fw.exists():
        pytest.skip(f"Matter firmware image not found at {fw}; place the esp-matter light merged bin there")
    base = f"python -m esptool --chip esp32c3 --port {port} --before default_reset --after hard_reset write_flash"
    commands = [f"{base} 0x0 {fw}"]
    if inject:
        # Separate invocation: the merged image overlaps the nvs region, and
        # esptool rejects overlapping writes within one call.
        commands.append(base + "".join(f" {hex(offset)} {bin_path}" for offset, bin_path in inject))
    for cmd in commands:
        logger.info("Flashing Matter image: %s", cmd)
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=240)
        if result.returncode != 0:
            raise RuntimeError(f"Matter image flash failed: {result.stdout[-500:]}\n{result.stderr[-500:]}")


def _account_cloud(pytestconfig, registered_user_resolver, registered_user_password_resolver):
    import yaml
    from utils.rainmaker_cloud import RainMakerCloud
    deployment = pytestconfig.getoption("--deployment")
    cfg_path = Path(__file__).resolve().parents[3] / "config" / "deployment.yaml"
    base_uri = (yaml.safe_load(cfg_path.read_text()).get(deployment, {}) or {}).get("uri")
    if not base_uri:
        return None
    try:
        email = registered_user_resolver("registered user 1")
        password = registered_user_password_resolver("registered user 1 password")
        return RainMakerCloud(base_uri, email, password)
    except Exception as error:
        logger.warning("Could not build cloud client for cleanup: %s", error)
        return None


@pytest.fixture
def matter_account_cleanup(pytestconfig, registered_user_resolver, registered_user_password_resolver):
    """Unmap only the Matter '{Light}' node before and after (leaving 'E2E Light'/'Network Light' so device_control reuses them, not re-provisions)."""
    cloud = _account_cloud(pytestconfig, registered_user_resolver, registered_user_password_resolver)
    if cloud is not None:
        logger.info("Cleared %s stale Matter '%s' node(s)", cloud.remove_nodes_named(MATTER_DEVICE_NAME), MATTER_DEVICE_NAME)
    yield cloud
    if cloud is not None:
        try:
            cloud.remove_nodes_named(MATTER_DEVICE_NAME)
        except Exception as error:
            logger.warning("Post-test Matter node cleanup failed: %s", error)


@pytest.fixture
def matter_device(request, resource_manager, per_test_debug_dir, helper, matter_account_cleanup):
    if helper.driver._test_info.get("platform", "android") == "ios":
        pytest.skip("iOS Matter commissioning (Apple pairing sheet) not yet automated")
    if not MATTER_CHIP_MAC:
        pytest.skip("MATTER_CHIP_MAC not set (see test/README.md)")
    if MATTER_FW_BIN and MATTER_QR:
        fw, inject, qr, expected_discriminator = MATTER_FW_BIN, None, MATTER_QR, None
        logger.info("Matter static override: image=%s qr=%s", fw, qr)
    else:
        try:
            fw_info = _prepare_dynamic_firmware(per_test_debug_dir.root / "matter_mfg")
        except Exception as error:
            pytest.skip(f"Dynamic Matter firmware preparation failed: {error}")
        fw = fw_info["merged_bin"]
        inject = [(offset, fw_info["fctry_bin"]) for offset in fw_info["inject_offsets"]]
        qr = fw_info["qr"]
        expected_discriminator = fw_info["discriminator"]
        logger.info("Matter dynamic factory: discriminator=%s passcode=%s qr=%s inject=%s",
                    expected_discriminator, fw_info["passcode"], qr,
                    [hex(offset) for offset, _ in inject])
    # Reserve the Matter chip by MAC
    resource = resource_manager.acquire_mac(MATTER_CHIP_MAC, test_name=request.node.nodeid)
    port = resource.port
    device = None
    try:
        _flash_matter_image(port, fw, inject)
        log_path = per_test_debug_dir.root / "matter_esp32c3.log"
        device = MatterDevice(port, log_path)
        device.start_capture(trigger_reset=True)
        if not device.wait_for_serial(COMMISSIONING_WINDOW_MARKER, timeout=60):
            pytest.skip("Matter device did not open a commissioning window after flashing")
        if expected_discriminator is not None and not device.wait_for_serial(
                f"discriminator={expected_discriminator}/", timeout=10):
            raise RuntimeError(
                f"Device did not advertise the injected discriminator {expected_discriminator} "
                "— the image ignored the generated commissionable data (QR would not match)")
        from hardware import BuildMetadata, record_hardware_report
        metadata = BuildMetadata(chip="esp32c3", product="Matter", prov_mode="BLE", firmware_type="Matter Light (esp-matter)")
        record_hardware_report(request, device, metadata)
        request.node._chip_serial_log_path = str(log_path)
        platform = helper.driver._test_info.get("platform", "android")
        QrDisplay.show(qr, per_test_debug_dir.root, platform=platform)
        yield device
    finally:
        QrDisplay.close()
        if device is not None:
            try:
                device.factory_reset()
            finally:
                device.stop()
        resource_manager.release(resource.mac_address)


@given(parsers.parse('a matter "{product}" device in commissioning mode'))
def given_matter_device(matter_device, product):
    assert product == "light", f"Only the matter light is supported, got '{product}'"
