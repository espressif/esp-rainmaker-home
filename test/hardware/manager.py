# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Hardware resource discovery, allocation, and service factory."""
from __future__ import annotations

import logging
import os
import threading
import time
from typing import Dict, List, Optional

from hardware.config import HardwareConfig
from hardware.discovery import EspDiscoveryService
from hardware.exceptions import HardwareUnavailableException
from hardware.firmware import FirmwareService
from hardware.flashing import FlashingService
from hardware.locking import SqliteResourceStore
from hardware.models import EspResource, ResourceStatus
from hardware.serial import SerialLogService, booted_firmware

logger = logging.getLogger(__name__)

_INSTANCE: Optional["ResourceManager"] = None
_INSTANCE_LOCK = threading.Lock()
_HARDWARE_REPORT_KEY = "hardware_report_info"


class ResourceManager:
    """Exposes hardware services; BDD steps orchestrate acquire → flash → serial → release."""

    def __init__(self, config: Optional[HardwareConfig] = None):
        self.config = config or HardwareConfig.load()
        self.store = SqliteResourceStore(self.config.lock_db_path)
        self.discovery = EspDiscoveryService(esptool_path=self.config.esptool_path)
        self.firmware = FirmwareService(self.config)
        self.flasher = FlashingService(
            esptool_path=self.config.esptool_path,
            config=self.config,
        )
        self.serial_logger = SerialLogService()
        self._job_id = os.environ.get("CI_JOB_ID") or os.environ.get("BUILD_ID") or "local"

    @classmethod
    def get_instance(cls, config: Optional[HardwareConfig] = None) -> "ResourceManager":
        """Return process-wide service factory singleton."""
        global _INSTANCE
        with _INSTANCE_LOCK:
            if _INSTANCE is None:
                _INSTANCE = cls(config)
            return _INSTANCE

    def refresh_inventory(self) -> int:
        """Discover connected devices and upsert them into the registry."""
        count = 0
        reserved_ports = self.store.active_reserved_ports()
        for device in self.discovery.discover(exclude_ports=reserved_ports):
            self.store.upsert_discovered_device(
                mac_address=device.mac_address,
                chip_type=device.chip_type,
                port=device.port,
                serial_number=device.serial_number,
                usb_path=device.usb_path,
                metadata=device.to_dict(),
            )
            count += 1
        return count

    def acquire(
        self,
        chip_type: str,
        timeout: Optional[int] = None,
        test_name: str = "",
        lease_seconds: Optional[int] = None,
    ) -> EspResource:
        """
        Lock an available device matching chip_type (LRU strategy).

        @param chip_type - e.g. esp32c3
        @param timeout - Seconds to wait for availability
        @param test_name - Pytest node id for ownership tracking
        @returns Allocated EspResource
        """
        timeout = timeout if timeout is not None else self.config.acquire_timeout_seconds
        lease_seconds = lease_seconds or self.config.lock_stale_seconds
        deadline = time.time() + timeout
        chip_type = chip_type.lower()
        owner_pid = os.getpid()

        refreshed = False
        while time.time() < deadline:
            row = self.store.try_reserve(
                chip_type=chip_type,
                owner_pid=owner_pid,
                owner_job_id=self._job_id,
                owner_test=test_name,
                lease_seconds=lease_seconds,
            )
            if not row and not refreshed:
                # Probe USB only when the registry has nothing free — esptool
                # probing is slow and resets boards on the probed ports.
                self.refresh_inventory()
                refreshed = True
                continue
            if row:
                resource = EspResource(
                    mac_address=row["mac_address"],
                    port=row["port"],
                    chip_type=row["chip_type"],
                    status=ResourceStatus.RESERVED,
                    serial_number=row.get("serial_number"),
                    usb_path=row.get("usb_path"),
                    owner_pid=owner_pid,
                    owner_job_id=self._job_id,
                    owner_test=test_name,
                )
                logger.info(
                    "Acquired %s (%s) on %s for %s",
                    resource.chip_type,
                    resource.mac_address,
                    resource.port,
                    test_name or "unknown-test",
                )
                return resource
            time.sleep(2)

        raise HardwareUnavailableException(
            f"No available {chip_type} device within {timeout}s"
        )

    def acquire_mac(
        self,
        mac_address: str,
        timeout: Optional[int] = None,
        test_name: str = "",
        lease_seconds: Optional[int] = None,
    ) -> EspResource:
        """Lock one SPECIFIC device by MAC (e.g. the Matter chip) so active_reserved_ports() protects it from a sibling run's discovery reset (needs the shared lock db)."""
        timeout = timeout if timeout is not None else self.config.acquire_timeout_seconds
        lease_seconds = lease_seconds or self.config.lock_stale_seconds
        deadline = time.time() + timeout
        owner_pid = os.getpid()

        refreshed = False
        while time.time() < deadline:
            row = self.store.try_reserve_mac(
                mac_address=mac_address,
                owner_pid=owner_pid,
                owner_job_id=self._job_id,
                owner_test=test_name,
                lease_seconds=lease_seconds,
            )
            if not row and not refreshed:
                # The chip may not be in the registry yet — probe USB once.
                self.refresh_inventory()
                refreshed = True
                continue
            if row:
                resource = EspResource(
                    mac_address=row["mac_address"],
                    port=row["port"],
                    chip_type=row["chip_type"],
                    status=ResourceStatus.RESERVED,
                    serial_number=row.get("serial_number"),
                    usb_path=row.get("usb_path"),
                    owner_pid=owner_pid,
                    owner_job_id=self._job_id,
                    owner_test=test_name,
                )
                logger.info(
                    "Acquired %s by MAC on %s for %s",
                    resource.mac_address,
                    resource.port,
                    test_name or "unknown-test",
                )
                return resource
            time.sleep(2)

        raise HardwareUnavailableException(
            f"Device {mac_address} not available within {timeout}s"
        )

    def release(self, mac_address: str, failed: bool = False, error: str = "") -> None:
        """Release a resource back to the available pool."""
        if failed:
            self.store.update_status(mac_address, ResourceStatus.FAILED, error=error)
        self.store.release(mac_address)
        logger.info("Released resource %s", mac_address)

    def update_status(self, mac_address: str, status: ResourceStatus, error: str = "") -> None:
        """Update lifecycle status without releasing."""
        self.store.update_status(mac_address, status, error=error)


def record_hardware_report(request, resource: EspResource, metadata, extra=None) -> None:
    """
    Record hardware metadata for a test's HTML report.

    A test may flash more than one chip, so entries accumulate as a list per
    node id (deduplicated by MAC — re-flashing the same chip updates in place).
    """
    info = metadata.report_dict()
    info.update(
        {
            "mac_address": resource.mac_address,
            "usb_port": resource.port,
        }
    )
    info.update(extra or {})
    if getattr(resource, "serial_log_path", None):
        for key, value in booted_firmware(resource.serial_log_path).items():
            info.setdefault(key, value)
    store = getattr(request.session, _HARDWARE_REPORT_KEY, None)
    if store is None:
        store = {}
        setattr(request.session, _HARDWARE_REPORT_KEY, store)
    entries = store.setdefault(request.node.nodeid, [])
    for index, existing in enumerate(entries):
        if existing.get("mac_address") == info["mac_address"]:
            entries[index] = info
            return
    entries.append(info)


def get_hardware_report_for_session(session) -> Dict[str, List[Dict[str, str]]]:
    """Return {node id: [hardware info per chip]} collected during the session."""
    return getattr(session, _HARDWARE_REPORT_KEY, {})
