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
        # mac_address -> signature of the last image written this session, so a
        # scenario re-requesting the same firmware skips the ~30s esptool write
        # (hard_reset still clears nvs between scenarios for re-provisioning).
        self._flashed_sig: dict = {}

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
        if self._flashed_sig.get(resource.mac_address) == signature:
            # Same app image already on the device; just clear nvs so it re-enters
            # provisioning (a full flash would reset it anyway), skipping the ~30s write.
            logger.info(
                "Skipping re-flash of %s: same image this session; erasing nvs only",
                resource.mac_address,
            )
            self.hard_reset(resource)
            return
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

    def hard_reset(self, resource: EspResource) -> bool:
        """
        Factory-reset provisioning state by erasing the `nvs` partition only.

        Erases nvs (0x10000, 24K = 0x6000) — Wi-Fi credentials + app config — so
        the device boots back into provisioning mode. The `fctry` partition
        (RainMaker claiming key/cert, ~0x3fa000) and `esp_secure_cert` are NOT
        touched, so claiming data survives a hard reset.

        @param resource - Allocated ESP resource
        @returns True when erase succeeds
        """
        chip = resource.chip_type.lower()
        command = (
            f"{self.esptool_path} --chip {chip} --port {resource.port} "
            "erase_region 0x10000 0x6000"
        )
        logger.info("Erasing nvs (provisioning state) for %s on %s", resource.chip_type, resource.port)
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
