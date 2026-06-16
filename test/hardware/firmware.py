# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Firmware metadata and flash plan resolution from ESP-IDF build artifacts."""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

from hardware.config import HardwareConfig
from hardware.exceptions import FirmwareMismatchError, FirmwareNotFoundError
from hardware.models import FirmwareImage, FlashSegment
from hardware.requirements import HardwareRequirement, normalize_chip

logger = logging.getLogger(__name__)

_COMMIT_PREFIX = re.compile(r"^(esp-idf|esp-rainmaker):\s*HEAD:\s*([0-9a-f]+)", re.I)
_KV_PATTERN = re.compile(r"^([a-z_]+):\s*(.+)$", re.I)


@dataclass
class BuildMetadata:
    """Parsed firmware bundle metadata."""

    product: Optional[str] = None
    chip: Optional[str] = None
    prov_mode: Optional[str] = None
    flash_size: Optional[str] = None
    firmware_type: Optional[str] = None
    esp_idf_commit: Optional[str] = None
    esp_rainmaker_commit: Optional[str] = None
    ota_version_number: Optional[str] = None
    ota_version_string: Optional[str] = None
    source_path: Optional[str] = None
    raw_lines: List[str] = field(default_factory=list)

    @property
    def bundle_root(self) -> Path:
        """Firmware bundle directory containing build_details and Firmware/."""
        if not self.source_path:
            raise FirmwareNotFoundError("Build metadata has no source bundle path")
        return Path(self.source_path).parent

    def report_dict(self) -> Dict[str, str]:
        """Critical fields for HTML reports (commits shortened for display)."""
        return {
            "chip_type": (self.chip or "").upper(),
            "product": self.product or "",
            "provisioning_mode": (self.prov_mode or "").upper(),
            "firmware_type": self.firmware_type or "",
            "esp_idf_commit": (self.esp_idf_commit or "")[:8],
            "esp_rainmaker_commit": (self.esp_rainmaker_commit or "")[:8],
        }


def _bundle_build_number(bundle_dir: Path) -> int:
    """Trailing integer of a bundle name (..._esp32c3_2420 -> 2420); -1 if none."""
    match = re.search(r"_(\d+)$", bundle_dir.name)
    return int(match.group(1)) if match else -1


def _find_info_path(bundle_dir: Path) -> Optional[Path]:
    """Return build_details.info (fallback build_details.txt) inside a bundle directory."""
    for name in ("build_details.info", "build_details.txt"):
        candidate = bundle_dir / name
        if candidate.exists():
            return candidate
    return None


class FirmwareService:
    """Locate firmware bundles per chip and resolve esptool flash plans from flasher_args.json."""

    def __init__(self, config: HardwareConfig):
        self.config = config

    def find_bundle_infos(self) -> List[Path]:
        """
        Locate build_details files for all firmware bundles under firmware_root.

        Supports both layouts:
          firmwares/<bundle>/build_details.*   (one bundle per chip)
          <firmware_root>/build_details.*      (single-bundle root)
        """
        root = self.config.firmware_root
        root_info = _find_info_path(root)
        if root_info:
            return [root_info]
        if not root.is_dir():
            raise FirmwareNotFoundError(f"Firmware root not found: {root}")
        # Newest bundle first, so a stale bundle next to a fresh one never wins.
        # Names end with the Jenkins build number (..._esp32c3_2420); sort by
        # that integer — not lexically, where "..._9" would beat "..._10".
        bundles = [path for path in root.iterdir() if path.is_dir() and _find_info_path(path)]
        bundles.sort(key=_bundle_build_number, reverse=True)
        infos = [_find_info_path(path) for path in bundles]
        if not infos:
            raise FirmwareNotFoundError(f"No firmware bundles with build_details under {root}")
        return infos

    def load_metadata(self, requirement: HardwareRequirement) -> BuildMetadata:
        """
        Find and parse the firmware bundle matching the scenario requirement.

        Matches on chip, and on product/prov_mode when both the requirement and
        the bundle declare them.

        @param requirement - Parsed BDD requirement
        @returns BuildMetadata of the matching bundle
        """
        candidates: List[BuildMetadata] = []
        for info_path in self.find_bundle_infos():
            metadata = self._parse_info(info_path)
            candidates.append(metadata)
            if metadata.chip and metadata.chip != requirement.chip_type:
                continue
            if (
                requirement.product
                and metadata.product
                and metadata.product.lower() != requirement.product.lower()
            ):
                continue
            if (
                requirement.prov_mode
                and metadata.prov_mode
                and metadata.prov_mode != requirement.prov_mode
            ):
                continue
            return metadata
        available = ", ".join(
            f"{meta.bundle_root.name} (chip={meta.chip}, product={meta.product}, prov_mode={meta.prov_mode})"
            for meta in candidates
        )
        raise FirmwareNotFoundError(
            f"No firmware bundle for chip={requirement.chip_type}"
            f" product={requirement.product or 'any'} prov_mode={requirement.prov_mode or 'any'}"
            f" under {self.config.firmware_root}. Available: {available or 'none'}"
        )

    def _parse_info(self, path: Path) -> BuildMetadata:
        """Parse a build_details file into BuildMetadata."""
        lines = path.read_text(encoding="utf-8").splitlines()
        metadata = BuildMetadata(source_path=str(path), raw_lines=lines)

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            commit_match = _COMMIT_PREFIX.match(stripped)
            if commit_match:
                key = commit_match.group(1).lower()
                if key == "esp-idf":
                    metadata.esp_idf_commit = commit_match.group(2)
                elif key == "esp-rainmaker":
                    metadata.esp_rainmaker_commit = commit_match.group(2)
                continue

            kv_match = _KV_PATTERN.match(stripped)
            if not kv_match:
                continue
            key = kv_match.group(1).lower()
            value = kv_match.group(2).strip()
            if key == "product":
                metadata.product = value
            elif key == "chip":
                metadata.chip = normalize_chip(value)
            elif key == "prov_mode":
                metadata.prov_mode = value.lower()
            elif key == "flash_size":
                metadata.flash_size = value
            elif key == "firmware_type" and not metadata.firmware_type:
                metadata.firmware_type = value
            elif key == "ota project version number":
                metadata.ota_version_number = value
            elif key == "ota project version string":
                metadata.ota_version_string = value

        logger.info(
            "Loaded build metadata chip=%s product=%s prov_mode=%s from %s",
            metadata.chip,
            metadata.product,
            metadata.prov_mode,
            path,
        )
        return metadata

    def validate(self, requirement: HardwareRequirement, metadata: BuildMetadata) -> None:
        """
        Fail early when firmware bundle does not match scenario requirements.

        @param requirement - Parsed BDD requirement
        @param metadata - Parsed build_details.info
        """
        errors: List[str] = []
        req_chip = requirement.chip_type
        if metadata.chip and metadata.chip != req_chip:
            errors.append(f"chip mismatch: required {req_chip}, bundle has {metadata.chip}")

        if requirement.product and metadata.product:
            if metadata.product.lower() != requirement.product.lower():
                errors.append(
                    f"product mismatch: required {requirement.product}, "
                    f"bundle has {metadata.product}"
                )

        req_mode = requirement.prov_mode
        if req_mode and metadata.prov_mode:
            if metadata.prov_mode.lower() != req_mode:
                errors.append(
                    f"prov_mode mismatch: required {req_mode}, bundle has {metadata.prov_mode}"
                )

        if errors:
            raise FirmwareMismatchError("; ".join(errors))

    def resolve_build_dir(self, requirement: HardwareRequirement, metadata: BuildMetadata) -> Path:
        """Return the ESP-IDF build directory for the requested firmware type."""
        firmware_type = requirement.firmware_type or self.config.firmware_type
        build_dir = metadata.bundle_root / "Firmware" / firmware_type / "build"
        if not build_dir.is_dir():
            raise FirmwareNotFoundError(f"Firmware build directory not found: {build_dir}")
        return build_dir

    def resolve_image(
        self,
        requirement: HardwareRequirement,
        metadata: BuildMetadata,
    ) -> FirmwareImage:
        """
        Build a FirmwareImage from flasher_args.json produced by ESP-IDF.

        @param requirement - Scenario requirement from BDD steps
        @param metadata - Parsed build_details.info
        @returns FirmwareImage with absolute binary paths and esptool arguments
        """
        build_dir = self.resolve_build_dir(requirement, metadata)
        flasher_args_path = build_dir / "flasher_args.json"
        if not flasher_args_path.is_file():
            raise FirmwareNotFoundError(f"Missing flasher_args.json in {build_dir}")

        payload = json.loads(flasher_args_path.read_text(encoding="utf-8"))
        flash_files: Dict[str, str] = payload.get("flash_files") or {}
        if not flash_files:
            raise FirmwareNotFoundError(f"flash_files empty in {flasher_args_path}")

        segments: List[FlashSegment] = []
        for offset_hex, relative_path in sorted(flash_files.items(), key=lambda item: int(item[0], 0)):
            binary_path = (build_dir / relative_path).resolve()
            segments.append(
                FlashSegment(offset=int(offset_hex, 0), path=str(binary_path))
            )

        extra = payload.get("extra_esptool_args") or {}
        esptool_chip = str(extra.get("chip") or requirement.chip_type)
        product = requirement.product or metadata.product or "led_light"

        logger.info(
            "Resolved firmware chip=%s product=%s segments=%s build_dir=%s",
            esptool_chip,
            product,
            len(segments),
            build_dir,
        )

        return FirmwareImage(
            chip_type=requirement.chip_type,
            mode=requirement.prov_mode or metadata.prov_mode or "",
            security=requirement.security or "",
            product=product,
            version=metadata.ota_version_string,
            segments=segments,
            esptool_chip=esptool_chip,
            write_flash_args=list(payload.get("write_flash_args") or []),
            extra_esptool_args=dict(extra),
            build_dir=str(build_dir),
            metadata={
                "firmware_type": requirement.firmware_type or self.config.firmware_type,
                "flasher_args_path": str(flasher_args_path),
                "build_metadata": metadata.report_dict(),
            },
        )
