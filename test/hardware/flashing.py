# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Firmware flashing and hard-reset orchestration using esptool."""
from __future__ import annotations

import json
import logging
import os
import subprocess
import tempfile
from typing import List

from hardware.config import HardwareConfig
from hardware.exceptions import FlashingError
from hardware.models import EspResource, FirmwareImage

logger = logging.getLogger(__name__)

# nvs offset is derived per-image from the partition table; these are the fallback defaults
_DEFAULT_NVS_OFFSET = 0x10000
_DEFAULT_NVS_SIZE = 0x6000


def _partition_region_from_table(partition_table_path: str, label: str):
    """Parse an esp-idf partition-table.bin for the given partition label (offset, size); None if absent/unparseable."""
    try:
        with open(partition_table_path, "rb") as handle:
            table = handle.read()
    except OSError:
        return None
    for index in range(95):
        entry = table[index * 32:index * 32 + 32]
        if len(entry) < 32 or entry[0:2] != b"\xaa\x50":
            break
        entry_label = entry[12:28].split(b"\x00", 1)[0].decode(errors="replace")
        if entry_label == label:
            offset = int.from_bytes(entry[4:8], "little")
            size = int.from_bytes(entry[8:12], "little")
            return offset, size
    return None


def _nvs_region_from_partition_table(partition_table_path: str):
    """Parse an esp-idf partition-table.bin for the `nvs` data-partition (offset, size); None if absent/unparseable."""
    return _partition_region_from_table(partition_table_path, "nvs")


def _nvs_region_for_image(image: "FirmwareImage | None"):
    """nvs (offset, size) from this image's partition-table segment, else the rainmaker default."""
    if image is not None:
        pt = next((s for s in image.segments
                   if "partition" in os.path.basename(s.path).lower()), None)
        if pt:
            region = _nvs_region_from_partition_table(pt.path)
            if region:
                return region
    return _DEFAULT_NVS_OFFSET, _DEFAULT_NVS_SIZE


BAUD_RATE = 921600
# Flashing 4 segments at 921600 baud is ~15-20s; 45s gives headroom for a board
# that is slow to enter download mode (or a contended USB bus).
_FLASH_TIMEOUT_SECONDS = 45
# The nvs erase is quick; 20s (with a retry) covers a slow-to-enter-download board.
_HARD_RESET_TIMEOUT_SECONDS = 20
# Reading/writing small cert partitions at default baud; 60s covers a slow board.
_CERT_OP_TIMEOUT_SECONDS = 60

# Cert partitions preserved across deployment switches on a shared chip.
_CERT_PARTITION_LABELS = ("fctry", "esp_secure_cert")


class FlashingService:
    """Flash RainMaker firmware and perform hard reset on ESP resources."""

    def __init__(
        self,
        esptool_path: str = "python -m esptool",
        config: HardwareConfig | None = None,
    ):
        self.esptool_path = esptool_path
        self.config = config or HardwareConfig.load()
        # last-written image signature per MAC; a repeat same-firmware request skips the ~30s write.
        self._flashed_sig: dict = {}
        # last-flashed (nvs_offset, nvs_size) per MAC so a later imageless hard_reset erases the right offset.
        self._nvs_region: dict = {}

    @staticmethod
    def _image_signature(image: FirmwareImage) -> str:
        """Identity of a firmware image: offsets + paths + size/mtime of each segment."""
        parts = []
        for segment in sorted(image.segments, key=lambda item: item.offset):
            try:
                stat = os.stat(segment.path)
                parts.append(f"{segment.offset}:{segment.path}:{stat.st_size}:{int(stat.st_mtime)}")
            except OSError:
                parts.append(f"{segment.offset}:{segment.path}")
        return "|".join(parts)

    def flash(self, resource: EspResource, firmware_image: FirmwareImage) -> None:
        """
        Flash firmware onto the allocated resource.

        @param resource - Locked ESP resource
        @param firmware_image - Resolved binaries and esptool arguments
        """
        signature = self._image_signature(firmware_image)
        self._nvs_region[resource.mac_address] = _nvs_region_for_image(firmware_image)
        if self._flashed_sig.get(resource.mac_address) == signature:
            # Same app image already on the device this session; skip the ~30s write.
            logger.info(
                "Skipping re-flash of %s: same image this session",
                resource.mac_address,
            )
        else:
            command = self._build_write_flash_command(resource.port, firmware_image, BAUD_RATE)
            logger.info("Flashing %s on %s: %s", resource.chip_type, resource.port, command)
            # esptool occasionally fails mid-write on a contended USB bus ("Checksum
            # error", "Timed out", "Failed to write to target RAM"); these are
            # transient, so retry once before giving up.
            output = ""
            for attempt in range(2):
                result = subprocess.run(
                    command,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=_FLASH_TIMEOUT_SECONDS,
                    check=False,
                )
                output = f"{result.stdout or ''}\n{result.stderr or ''}".strip()
                if result.returncode == 0:
                    break
                logger.warning(
                    "Flash attempt %s/2 failed for %s: %s",
                    attempt + 1, resource.mac_address, output[-300:],
                )
            else:
                raise FlashingError(
                    f"Flash failed for {resource.mac_address}: {output[-2000:]}"
                )
            self._flashed_sig[resource.mac_address] = signature
            logger.info("Flash completed for %s", resource.mac_address)

    def invalidate_flash_cache(self, mac_address: str) -> None:
        """Forget the last-flashed image for a chip that was flashed outside this service (e.g. the Matter fixture's own esptool call), so the next request writes instead of skipping."""
        self._flashed_sig.pop(mac_address, None)

    def last_flash_signature(self, mac_address: str) -> "str | None":
        return self._flashed_sig.get(mac_address)

    def hard_reset(self, resource: EspResource, image: "FirmwareImage | None" = None) -> bool:
        """
        Factory-reset provisioning state by erasing only `nvs` (offset from the image's partition table, else the last-flash cache); `fctry`/`esp_secure_cert` are untouched so claiming data survives.

        @param resource - Allocated ESP resource
        @param image - Firmware image whose partition table gives the nvs offset (optional)
        @returns True when erase succeeds
        """
        if image is not None:
            offset, size = _nvs_region_for_image(image)
        else:
            offset, size = self._nvs_region.get(
                resource.mac_address, (_DEFAULT_NVS_OFFSET, _DEFAULT_NVS_SIZE))
        self._nvs_region[resource.mac_address] = (offset, size)
        chip = resource.chip_type.lower()
        command = (
            f"{self.esptool_path} --chip {chip} --port {resource.port} "
            f"erase_region {hex(offset)} {hex(size)}"
        )
        logger.info("Erasing nvs @%s (size %s, provisioning state) for %s on %s",
                    hex(offset), hex(size), resource.chip_type, resource.port)
        # esptool can transiently fail to enter download mode on a contended/noisy
        # USB bus ("Serial data stream stopped", "Device not configured") or time
        # out waiting for the board; retry once before giving up, like flash().
        output = ""
        for attempt in range(2):
            try:
                result = subprocess.run(
                    command,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=_HARD_RESET_TIMEOUT_SECONDS,
                    check=False,
                )
            except subprocess.TimeoutExpired:
                output = f"erase timed out after {_HARD_RESET_TIMEOUT_SECONDS}s"
                logger.warning("Hard reset attempt %s/2 timed out for %s", attempt + 1, resource.mac_address)
                continue
            output = f"{result.stdout or ''}\n{result.stderr or ''}".strip()
            if result.returncode == 0:
                logger.info("Hard reset completed for %s", resource.mac_address)
                return True
            logger.warning(
                "Hard reset attempt %s/2 failed for %s: %s",
                attempt + 1, resource.mac_address, output[-300:],
            )
        raise FlashingError(
            f"Hard reset failed for {resource.mac_address}: {output[-2000:]}"
        )

    def _build_write_flash_command(self, port: str, image: FirmwareImage, baud: int) -> str:
        """Build esptool write_flash command from flasher_args.json resolution."""
        parts: List[str] = [
            self.esptool_path,
            f"--chip {image.esptool_chip}",
            f"--port {port}",
            f"--baud {baud}",
        ]

        extra = image.extra_esptool_args or {}
        before = extra.get("before")
        after = extra.get("after")
        if before:
            parts.append(f"--before {before}")
        if after:
            parts.append(f"--after {after}")
        if extra.get("stub") is False:
            parts.append("--no-stub")

        parts.append("write_flash")
        parts.extend(image.write_flash_args or [])

        for segment in sorted(image.segments, key=lambda item: item.offset):
            parts.append(hex(segment.offset))
            parts.append(segment.path)

        return " ".join(parts)

    @staticmethod
    def _store_root() -> str:
        """Root of the on-disk cert backup store."""
        return os.path.join(os.path.expanduser("~"), ".esp_cert_store")

    def _chip_deployment_dir(self, mac: str, deployment: str) -> str:
        """Per-chip, per-deployment directory holding that deployment's cert backups."""
        return os.path.join(self._store_root(), mac, deployment)

    @staticmethod
    def _load_json(path: str):
        """Read a JSON file; None on any error (missing/corrupt)."""
        try:
            with open(path) as handle:
                return json.load(handle)
        except (OSError, ValueError):
            return None

    @staticmethod
    def _write_json(path: str, data) -> None:
        """Write a JSON file, creating parent directories as needed."""
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as handle:
            json.dump(data, handle, indent=2)

    def _run_esptool_best_effort(self, command: str, timeout: int, description: str) -> bool:
        """Run an esptool command with the flash()/hard_reset() retry-once + timeout pattern; True on success, never raises."""
        output = ""
        for attempt in range(2):
            try:
                result = subprocess.run(
                    command,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    check=False,
                )
            except subprocess.TimeoutExpired:
                logger.warning("cert-store %s attempt %s/2 timed out", description, attempt + 1)
                continue
            output = f"{result.stdout or ''}\n{result.stderr or ''}".strip()
            if result.returncode == 0:
                return True
            logger.warning(
                "cert-store %s attempt %s/2 failed: %s",
                description, attempt + 1, output[-300:],
            )
        return False

    def _device_cert_regions(self, resource: EspResource, image: "FirmwareImage | None" = None) -> dict:
        """{label: (offset, size)} for cert partitions present either in image's partition table or on the device."""
        regions: dict = {}
        if image is not None:
            pt = next((s for s in image.segments
                       if "partition" in os.path.basename(s.path).lower()), None)
            if pt:
                for label in _CERT_PARTITION_LABELS:
                    region = _partition_region_from_table(pt.path, label)
                    if region:
                        regions[label] = region
            return regions
        chip = resource.chip_type.lower()
        tmp_path = None
        try:
            handle, tmp_path = tempfile.mkstemp(suffix=".bin")
            os.close(handle)
            command = (
                f"{self.esptool_path} --chip {chip} --port {resource.port} "
                f"read_flash 0x8000 0xC00 {tmp_path}"
            )
            if self._run_esptool_best_effort(
                command, _CERT_OP_TIMEOUT_SECONDS,
                f"read partition table for {resource.mac_address}",
            ):
                for label in _CERT_PARTITION_LABELS:
                    region = _partition_region_from_table(tmp_path, label)
                    if region:
                        regions[label] = region
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
        return regions

    def backup_certs(self, resource: EspResource, deployment: str, image: "FirmwareImage | None" = None) -> None:
        """Best-effort, idempotent read-back of this deployment's cert partitions to the on-disk store; never raises."""
        try:
            regions = self._device_cert_regions(resource, image=image)
            if not regions:
                logger.info("cert-store: no cert partitions to back up for %s/%s",
                            resource.mac_address, deployment)
                return
            target_dir = self._chip_deployment_dir(resource.mac_address, deployment)
            os.makedirs(target_dir, exist_ok=True)
            chip = resource.chip_type.lower()
            stored = self._load_json(os.path.join(target_dir, "regions.json")) or {}
            for label, (offset, size) in regions.items():
                bin_path = os.path.join(target_dir, f"{label}.bin")
                if os.path.exists(bin_path):
                    stored[label] = [offset, size]
                    continue
                command = (
                    f"{self.esptool_path} --chip {chip} --port {resource.port} "
                    f"read_flash {hex(offset)} {hex(size)} {bin_path}"
                )
                logger.info("cert-store: backing up %s @%s (size %s) for %s -> %s",
                            label, hex(offset), hex(size), resource.mac_address, deployment)
                if self._run_esptool_best_effort(
                    command, _CERT_OP_TIMEOUT_SECONDS,
                    f"backup {label} for {resource.mac_address}",
                ):
                    stored[label] = [offset, size]
            self._write_json(os.path.join(target_dir, "regions.json"), stored)
        except Exception as exc:
            logger.warning("cert-store backup_certs failed for %s/%s: %s",
                           resource.mac_address, deployment, exc)

    def restore_certs(self, resource: EspResource, deployment: str) -> bool:
        """Best-effort write-back of a deployment's stored cert partitions onto the chip; True if any written, never raises."""
        try:
            target_dir = self._chip_deployment_dir(resource.mac_address, deployment)
            regions = self._load_json(os.path.join(target_dir, "regions.json"))
            if not regions:
                return False
            chip = resource.chip_type.lower()
            written = False
            for label, region in regions.items():
                bin_path = os.path.join(target_dir, f"{label}.bin")
                if not os.path.exists(bin_path):
                    continue
                offset = region[0]
                command = (
                    f"{self.esptool_path} --chip {chip} --port {resource.port} "
                    f"write_flash {hex(offset)} {bin_path}"
                )
                logger.info("cert-store: restoring %s @%s for %s <- %s",
                            label, hex(offset), resource.mac_address, deployment)
                if self._run_esptool_best_effort(
                    command, _CERT_OP_TIMEOUT_SECONDS,
                    f"restore {label} for {resource.mac_address}",
                ):
                    written = True
            return written
        except Exception as exc:
            logger.warning("cert-store restore_certs failed for %s/%s: %s",
                           resource.mac_address, deployment, exc)
            return False

    def prepare_certs(self, resource: EspResource, target_deployment: str, image: "FirmwareImage | None" = None) -> bool:
        """Preserve certs across a deployment switch on a shared chip — back up the outgoing deployment then restore the target; True if any target cert written, never raises."""
        try:
            tracking_path = os.path.join(self._store_root(), "chip_deployment.json")
            tracked = self._load_json(tracking_path) or {}
            mac = resource.mac_address
            prev = tracked.get(mac)
            if prev and prev != target_deployment:
                self.backup_certs(resource, prev, image=None)
            tracked[mac] = target_deployment
            self._write_json(tracking_path, tracked)
            return self.restore_certs(resource, target_deployment)
        except Exception as exc:
            logger.warning("cert-store prepare_certs failed for %s -> %s: %s",
                           resource.mac_address, target_deployment, exc)
            return False
