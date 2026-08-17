# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Firmware flashing and hard-reset orchestration using esptool."""
from __future__ import annotations

import logging
import os
import subprocess
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
