# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Parse hardware requirements from Pytest-BDD feature steps."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


def normalize_chip(value: str) -> str:
    """
    Normalize any chip label to the canonical framework identifier.

    "ESP32-C3", "esp32 c3", "ESP32C3" -> "esp32c3". Shared by feature-file
    requirements, esptool discovery output, and build_details metadata.
    """
    return value.strip().lower().replace(" ", "").replace("-", "")


@dataclass
class HardwareRequirement:
    """Scenario-driven hardware and firmware requirements."""

    chip_type: str
    product: Optional[str] = None
    prov_mode: Optional[str] = None
    security: Optional[str] = None
    firmware_type: str = "Evaluation"
    chal_resp: Optional[bool] = None
    deployment: Optional[str] = None

    def __post_init__(self):
        """Automatically normalizes fields right after the object is created."""
        self.chip_type = normalize_chip(self.chip_type)
        if self.prov_mode:
            self.prov_mode = self.prov_mode.strip().lower()
        if self.deployment:
            self.deployment = self.deployment.strip().lower()
