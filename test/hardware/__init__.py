# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""ESP hardware resource management, flashing, and serial logging for CI automation."""

from hardware.artifacts import TestArtifactDir
from hardware.config import HardwareConfig
from hardware.firmware import BuildMetadata, FirmwareService
from hardware.manager import ResourceManager, get_hardware_report_for_session, record_hardware_report
from hardware.models import EspResource, FirmwareImage, ResourceStatus
from hardware.qr import QrDisplay, QrPayloadExtractor
from hardware.requirements import HardwareRequirement

__all__ = [
    "BuildMetadata",
    "EspResource",
    "FirmwareImage",
    "FirmwareService",
    "HardwareConfig",
    "HardwareRequirement",
    "QrDisplay",
    "QrPayloadExtractor",
    "ResourceManager",
    "ResourceStatus",
    "TestArtifactDir",
    "get_hardware_report_for_session",
    "record_hardware_report",
]
