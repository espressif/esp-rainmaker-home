# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Automatic discovery of connected ESP devices over USB serial."""
from __future__ import annotations

import logging
import re
import subprocess
from dataclasses import dataclass
from typing import Dict, List, Optional

from serial.tools import list_ports

from hardware.exceptions import DeviceDiscoveryError
from hardware.requirements import normalize_chip
from hardware.serial import normalize_serial_port

logger = logging.getLogger(__name__)

_MAC_PATTERN = re.compile(r"MAC:\s*([0-9a-fA-F:]{17})")
_CHIP_PATTERN = re.compile(
    r"(?:Chip is|Chip type:|Connected to)\s+(ESP32[A-Z0-9-]*)",
    re.IGNORECASE,
)


@dataclass
class DiscoveredDevice:
    """Device discovered on a USB serial port."""

    chip_type: str
    mac_address: str
    port: str
    serial_number: Optional[str] = None
    usb_path: Optional[str] = None
    description: Optional[str] = None

    def to_dict(self) -> Dict[str, str]:
        """Serialize for logging."""
        return {
            "chip_type": self.chip_type,
            "mac_address": self.mac_address,
            "port": self.port,
            "serial_number": self.serial_number or "",
            "usb_path": self.usb_path or "",
            "status": "available",
        }


class EspDiscoveryService:
    """Scan serial ports and identify ESP devices via esptool."""

    def __init__(self, esptool_path: str = "python -m esptool", probe_timeout: int = 8):
        self.esptool_path = esptool_path
        self.probe_timeout = probe_timeout

    def list_candidate_ports(self) -> List[str]:
        """Return serial ports that commonly host ESP USB-UART bridges."""
        candidates = []
        for port in list_ports.comports():
            description = (port.description or "").lower()
            manufacturer = (port.manufacturer or "").lower()
            device = port.device
            device_lower = (device or "").lower()
            if (
                "bluetooth" in device_lower
                or "bluetooth" in description
                or device_lower.endswith(".blth")
            ):
                continue
            if any(
                token in description or token in manufacturer
                for token in ("usb", "serial", "uart", "cp210", "ch340", "ftdi", "jtag", "espressif")
            ):
                candidates.append(device)
                continue
            if device.startswith("/dev/cu.") or device.startswith("/dev/tty"):
                candidates.append(device)
        return candidates

    def _run_esptool(self, port: str, *args: str) -> str:
        """Execute esptool and return combined stdout/stderr."""
        command = f"{self.esptool_path} --port {port} {' '.join(args)}"
        logger.debug("Discovery command: %s", command)
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=self.probe_timeout,
            check=False,
        )
        output = f"{result.stdout or ''}\n{result.stderr or ''}"
        if result.returncode != 0 and "MAC:" not in output and "Chip is" not in output:
            raise DeviceDiscoveryError(output.strip() or f"esptool failed on {port}")
        return output

    def probe_port(self, port: str) -> Optional[DiscoveredDevice]:
        """Probe a single serial port and return ESP metadata when present."""
        try:
            output = self._run_esptool(port, "chip-id")
        except (DeviceDiscoveryError, subprocess.TimeoutExpired) as error:
            logger.debug("Modern esptool chip-id probe failed on %s: %s", port, error)
            try:
                output = self._run_esptool(port, "chip_id")
            except (DeviceDiscoveryError, subprocess.TimeoutExpired) as fallback_error:
                logger.debug("Port %s is not an ESP device: %s", port, fallback_error)
                return None

        chip_match = _CHIP_PATTERN.search(output)
        mac_match = _MAC_PATTERN.search(output)
        if not chip_match or not mac_match:
            return None

        chip_type = normalize_chip(chip_match.group(1)).upper()
        mac_address = mac_match.group(1).upper()

        port_info = next((item for item in list_ports.comports() if item.device == port), None)
        return DiscoveredDevice(
            chip_type=chip_type,
            mac_address=mac_address,
            port=normalize_serial_port(port),
            serial_number=getattr(port_info, "serial_number", None),
            usb_path=getattr(port_info, "location", None) or getattr(port_info, "hwid", None),
            description=getattr(port_info, "description", None),
        )

    def discover(self, ports: Optional[List[str]] = None) -> List[DiscoveredDevice]:
        """Discover all connected ESP devices."""
        discovered: List[DiscoveredDevice] = []
        seen_macs = set()
        for port in ports or self.list_candidate_ports():
            device = self.probe_port(port)
            if device and device.mac_address not in seen_macs:
                discovered.append(device)
                seen_macs.add(device.mac_address)
                logger.info(
                    "Discovered %s on %s (MAC %s)",
                    device.chip_type,
                    device.port,
                    device.mac_address,
                )
        return discovered
