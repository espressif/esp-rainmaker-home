# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Domain models for ESP hardware resources."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class ResourceStatus(str, Enum):
    """Lifecycle states for an ESP hardware resource."""

    AVAILABLE = "available"
    RESERVED = "reserved"
    FLASHING = "flashing"
    PROVISIONING = "provisioning"
    IN_USE = "in_use"
    FAILED = "failed"
    OFFLINE = "offline"


@dataclass
class EspResource:
    """Allocated ESP device used by a single test execution."""

    mac_address: str
    port: str
    chip_type: str
    status: ResourceStatus = ResourceStatus.RESERVED
    serial_number: Optional[str] = None
    usb_path: Optional[str] = None
    owner_pid: Optional[int] = None
    owner_job_id: Optional[str] = None
    owner_test: Optional[str] = None
    firmware_profile: Optional[str] = None
    serial_log_path: Optional[str] = None
    qr_payload: Optional[str] = None
    build_metadata: Optional[Any] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize resource for APIs and dashboards."""
        return {
            "mac_address": self.mac_address,
            "port": self.port,
            "chip_type": self.chip_type,
            "status": self.status.value,
            "serial_number": self.serial_number,
            "usb_path": self.usb_path,
            "owner_pid": self.owner_pid,
            "owner_job_id": self.owner_job_id,
            "owner_test": self.owner_test,
            "firmware_profile": self.firmware_profile,
            "serial_log_path": self.serial_log_path,
            "qr_payload": self.qr_payload,
            "metadata": self.metadata,
        }


@dataclass
class FlashSegment:
    """Single flash write segment."""

    offset: int
    path: str


@dataclass
class FirmwareImage:
    """Resolved firmware binaries and flash plan."""

    chip_type: str
    mode: str
    security: str
    product: str
    version: Optional[str]
    segments: List[FlashSegment]
    esptool_chip: str
    write_flash_args: List[str] = field(default_factory=list)
    extra_esptool_args: Dict[str, Any] = field(default_factory=dict)
    build_dir: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
