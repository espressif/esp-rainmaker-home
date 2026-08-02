# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Matter commissioning device setup — dedicated chip flashed with the auto-updated esp-matter light image + a unique per-run factory partition (dynamic QR)."""
import hashlib
import logging
import os
import random
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest
from pytest_bdd import given, parsers

from hardware.qr import QrDisplay
from hardware.serial import _SerialCapture
from scripts.download_firmwares import download_matter_image, download_rmneo_matter_image

logger = logging.getLogger(__name__)

MATTER_CHIP_MAC = os.getenv("MATTER_CHIP_MAC")
# matter_only (esp-matter demo light) static override: set BOTH to skip dynamic download + factory generation and commission a fixed image/payload.
MATTER_FW_BIN = os.getenv("MATTER_FW_BIN")
MATTER_QR = os.getenv("MATTER_QR")
# rmneo_matter inputs: factory_autoreg.py --matter mints a per-node fctry (Matter DAC + RainMaker claim) injected into the RMNEO matter-light image so the node boots RainMaker+Matter, not Matter-only.
RMNEO_MATTER_FW_BIN = os.getenv("RMNEO_MATTER_FW_BIN")        # merged RMNEO matter-light app image (flashed at 0x0)
RMNEO_MATTER_FCTRY_BIN = os.getenv("RMNEO_MATTER_FCTRY_BIN")  # factory_autoreg --matter fctry.bin (injected at the `fctry` offset)
RMNEO_MATTER_QR = os.getenv("RMNEO_MATTER_QR")               # factory_autoreg qr_payload (MT: ...)
COMMISSIONING_WINDOW_MARKER = "Commissioning window opened"
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
    logger.info("Generating factory partition: %s", " ".join("****" if part == str(passcode) else part for part in cmd))
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


# product + firmware_type per scenario for the HTML report; only the RMNEO one also contains "rmneo", which is how report_generator tells the two apart.
_MATTER_SCENARIO_META = {
    "matter_only": {"product": "Matter Light", "firmware_type": "Matter Only (esp-matter)"},
    "rmneo_matter": {"product": "Matter Device", "firmware_type": "RMNEO+Matter (rmng-matter-sdk)"},
}


def _matter_scenario(request):
    """Matter variant for this scenario from its BDD tag (@rmneo_matter | @matter_only); defaults to matter_only."""
    return "rmneo_matter" if request.node.get_closest_marker("rmneo_matter") else "matter_only"


def _matter_plan(scenario, *, fw, inject, qr, expected_discriminator, source, commission_id=""):
    meta = _MATTER_SCENARIO_META[scenario]
    return {
        "scenario": scenario,
        "fw": fw,
        "inject": inject,
        "qr": qr,
        "expected_discriminator": expected_discriminator,
        "product": meta["product"],
        "firmware_type": meta["firmware_type"],
        "source": source,
        "commission_id": commission_id,
    }


def _matter_only_plan(workdir):
    """esp-matter demo light: pinned MATTER_FW_BIN override, else the auto-updated esp-matter image + a freshly generated (esp-matter-mfg-tool) factory partition/QR."""
    if MATTER_FW_BIN and MATTER_QR:
        return _matter_plan("matter_only", fw=MATTER_FW_BIN, inject=None, qr=MATTER_QR,
                            expected_discriminator=None, source="env-pinned (MATTER_FW_BIN)")
    fw_info = _prepare_dynamic_firmware(workdir)
    inject = [(offset, fw_info["fctry_bin"]) for offset in fw_info["inject_offsets"]]
    return _matter_plan("matter_only", fw=fw_info["merged_bin"], inject=inject,
                        qr=fw_info["qr"], expected_discriminator=fw_info["discriminator"],
                        source="github-download", commission_id=f"discriminator={fw_info['discriminator']}")


def _rmneo_fctry_node_id():
    fctry = Path(RMNEO_MATTER_FCTRY_BIN or "")
    return fctry.parents[1].name if fctry.name == "fctry.bin" and len(fctry.parents) > 1 else ""


def _rmneo_matter_plan(preflashed):
    """RMNEO+Matter light: inject the factory_autoreg --matter fctry (RainMaker claim + Matter DAC) into the RMNEO matter-light app image at its `fctry` partition, so the node boots RainMaker+Matter — never the Matter-only esp-matter image."""
    qr = RMNEO_MATTER_QR
    if preflashed:
        if not qr:
            raise RuntimeError("MATTER_PREFLASHED=1 needs RMNEO_MATTER_QR for the rmneo_matter scenario")
        return _matter_plan("rmneo_matter", fw=None, inject=None, qr=qr, expected_discriminator=None,
                            source="preflashed-reuse", commission_id=_rmneo_fctry_node_id())
    fw = RMNEO_MATTER_FW_BIN
    source = "local-build (RMNEO_MATTER_FW_BIN)"
    if not fw and os.getenv("RMNEO_MATTER_FW_URL"):
        fw = str(download_rmneo_matter_image())
        source = "url-download (RMNEO_MATTER_FW_URL)"
    if not (fw and RMNEO_MATTER_FCTRY_BIN and qr):
        raise RuntimeError(
            "RMNEO+Matter firmware not provided. Mint the per-node fctry + QR with "
            "factory_autoreg.py --matter, then set RMNEO_MATTER_FW_BIN (merged RMNEO matter-light "
            "app image), RMNEO_MATTER_FCTRY_BIN (fctry.bin) and RMNEO_MATTER_QR (MT: payload); "
            "see test/README.md")
    partitions = _find_partitions(fw)
    if "fctry" not in partitions:
        raise RuntimeError(f"RMNEO+Matter image has no 'fctry' partition; labels: {list(partitions)}")
    fctry_offset, fctry_size = partitions["fctry"]
    fctry_len = Path(RMNEO_MATTER_FCTRY_BIN).stat().st_size
    if fctry_len > fctry_size:
        raise RuntimeError(f"fctry.bin (0x{fctry_len:x}) exceeds 'fctry' partition (0x{fctry_size:x})")
    node_id = _rmneo_fctry_node_id()
    return _matter_plan("rmneo_matter", fw=fw, inject=[(fctry_offset, RMNEO_MATTER_FCTRY_BIN)],
                        qr=qr, expected_discriminator=None, source=source,
                        commission_id=f"node={node_id}" if node_id else "")


def _resolve_matter_plan(request, workdir):
    """Per-scenario firmware/QR selection: rmneo_matter and matter_only use DIFFERENT images so the RMNEO node never boots on the Matter-only esp-matter image."""
    if _matter_scenario(request) == "rmneo_matter":
        return _rmneo_matter_plan(os.getenv("MATTER_PREFLASHED") == "1")
    return _matter_only_plan(workdir)


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

    def wait_for_serial_number_since(self, prefix, expected, tol=0, base=10, timeout=30):
        # True when a line since the last mark_serial has any `prefix` followed by an int (in any `base`) within +/-tol.
        prefixes = prefix if isinstance(prefix, (list, tuple)) else (prefix,)
        bases = base if isinstance(base, (list, tuple)) else (base,)
        patterns = [re.compile(re.escape(p) + r"[:=\s]*(?:0x)?([0-9a-fA-F]+)") for p in prefixes]
        deadline = time.time() + timeout
        while time.time() < deadline:
            for line in self.lines()[self._since:]:
                for pattern in patterns:
                    match = pattern.search(line)
                    if not match:
                        continue
                    for number_base in bases:
                        try:
                            if abs(int(match.group(1), number_base) - expected) <= tol:
                                return True
                        except ValueError:
                            pass
            time.sleep(1)
        return False

    def factory_reset(self):
        if self._capture:
            self._capture.write_line("matter esp factoryreset")
            time.sleep(3)

    def stop(self):
        if self._capture:
            self._capture.stop()


_flashed_app_sig = {}


def _file_sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _resolve_fw_path(fw):
    fw = Path(fw)
    if not fw.is_absolute():
        fw = Path(__file__).resolve().parents[3] / fw
    if not fw.exists():
        pytest.skip(f"Matter firmware image not found at {fw}; place the esp-matter light merged bin there")
    return fw


def _flash_matter_image(port, fw, inject=None, skip_app=False):
    base = f"python -m esptool --chip esp32c3 --port {port} --before default_reset --after hard_reset write_flash"
    commands = [] if skip_app else [f"{base} 0x0 {fw}"]
    if inject:
        # Separate invocation: esptool rejects overlapping writes within one call.
        commands.append(base + "".join(f" {hex(offset)} {bin_path}" for offset, bin_path in inject))
    for cmd in commands:
        logger.info("Flashing Matter image: %s", cmd)
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=240)
        if result.returncode != 0:
            raise RuntimeError(f"Matter image flash failed: {result.stdout[-500:]}\n{result.stderr[-500:]}")


def _account_cloud(pytestconfig, registered_user_resolver, registered_user_password_resolver):
    import yaml
    from utils.rainmaker_cloud import cloud_for
    deployment = pytestconfig.getoption("--deployment")
    cfg_path = Path(__file__).resolve().parents[3] / "config" / "deployment.yaml"
    env_config = (yaml.safe_load(cfg_path.read_text()).get(deployment, {}) or {})
    if not env_config.get("uri"):
        return None
    try:
        email = registered_user_resolver("registered user 1")
        password = registered_user_password_resolver("registered user 1 password")
        return cloud_for(env_config, email, password)
    except Exception as error:
        logger.warning("Could not build cloud client for cleanup: %s", error)
        return None


@pytest.fixture
def matter_account_cleanup(pytestconfig, registered_user_resolver, registered_user_password_resolver):
    """Unmap stale Matter nodes before + after — incl. name=None , while keeping the reuse-online devices so device_control reuses them."""
    keep = {"E2E Light", "Network Light", "BLE Light", "Renamed Light", "SoftAP Light"}
    cloud = _account_cloud(pytestconfig, registered_user_resolver, registered_user_password_resolver)
    if cloud is not None:
        logger.info("Cleared %s stale Matter node(s) before test", cloud.remove_nodes_except(keep))
    yield cloud
    if cloud is not None:
        try:
            cloud.remove_nodes_except(keep)
        except Exception as error:
            logger.warning("Post-test Matter node cleanup failed: %s", error)


@pytest.fixture
def matter_device(request, resource_manager, per_test_debug_dir, helper, matter_account_cleanup):
    if helper.driver._test_info.get("platform", "android") == "ios":
        pytest.skip("iOS Matter commissioning (Apple pairing sheet) not yet automated")
    if not MATTER_CHIP_MAC:
        pytest.skip("MATTER_CHIP_MAC not set (see test/README.md)")
    try:
        plan = _resolve_matter_plan(request, per_test_debug_dir.root / "matter_mfg")
    except Exception as error:
        pytest.skip(f"Matter firmware preparation failed: {error}")
    fw = plan["fw"]
    inject = plan["inject"]
    qr = plan["qr"]
    expected_discriminator = plan["expected_discriminator"]
    fw_sha = ""
    skip_app = False
    if fw is not None:
        fw = _resolve_fw_path(fw)
        fw_sha = _file_sha(fw)
        skip_app = (_flashed_app_sig.get(MATTER_CHIP_MAC) == fw_sha and bool(inject)
                    and resource_manager.flasher.last_flash_signature(MATTER_CHIP_MAC) is None)
    logger.info("Firmware provenance [%s]: source=%s fw=%s sha256=%s inject=%s %s flash=%s",
                plan["scenario"], plan["source"], fw, fw_sha[:12],
                [hex(offset) for offset, _ in (inject or [])], plan["commission_id"],
                "fctry-only (app unchanged this session)" if skip_app else ("skipped (reuse)" if fw is None else "app+fctry"))
    # Reserve the Matter chip by MAC
    resource = resource_manager.acquire_mac(MATTER_CHIP_MAC, test_name=request.node.nodeid)
    port = resource.port
    device = None
    try:
        if fw is not None:
            _flash_matter_image(port, fw, inject, skip_app=skip_app)
            resource_manager.flasher.invalidate_flash_cache(MATTER_CHIP_MAC)
            _flashed_app_sig[MATTER_CHIP_MAC] = fw_sha
            resource_manager.flasher.invalidate_flash_cache(MATTER_CHIP_MAC)
        log_path = per_test_debug_dir.root / "matter_esp32c3.log"
        device = MatterDevice(port, log_path)
        device.start_capture(trigger_reset=True)
        if not device.wait_for_serial(COMMISSIONING_WINDOW_MARKER, timeout=60):
            pytest.skip("Matter device did not open a commissioning window after flashing")
        if expected_discriminator is not None and not (
                device.wait_for_serial(f"discriminator={expected_discriminator}/", timeout=5) or
                device.wait_for_serial(f"discriminator={expected_discriminator:04d}/", timeout=5)):
            raise RuntimeError(
                f"Device did not advertise the injected discriminator {expected_discriminator} "
                "— the image ignored the generated commissionable data (QR would not match)")
        from hardware import BuildMetadata, record_hardware_report
        metadata = BuildMetadata(chip="esp32c3", product=plan["product"], prov_mode="BLE",
                                 firmware_type=plan["firmware_type"])
        record_hardware_report(request, device, metadata, extra={
            "firmware_source": plan["source"],
            "image_sha": fw_sha[:12],
            "commission_id": plan["commission_id"],
        })
        request.node._chip_serial_log_path = str(log_path)
        platform = helper.driver._test_info.get("platform", "android")
        QrDisplay.show(qr, per_test_debug_dir.root, platform=platform)
        yield device
    finally:
        QrDisplay.close()
        if device is not None:
            device.stop()
        resource_manager.release(resource.mac_address)


@given(parsers.parse('a matter "{product}" device in commissioning mode'))
def given_matter_device(matter_device, product):
    assert product == "Light", f"Only the matter Light is supported, got '{product}'"
