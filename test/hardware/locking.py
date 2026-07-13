# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""SQLite-backed resource registry and cross-process locking."""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional

from hardware.models import ResourceStatus

logger = logging.getLogger(__name__)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS resources (
    mac_address TEXT PRIMARY KEY,
    chip_type TEXT NOT NULL,
    port TEXT NOT NULL,
    serial_number TEXT,
    usb_path TEXT,
    status TEXT NOT NULL DEFAULT 'available',
    owner_pid INTEGER,
    owner_job_id TEXT,
    owner_test TEXT,
    lock_acquired_at REAL,
    lock_expires_at REAL,
    last_seen_at REAL,
    last_released_at REAL,
    last_error TEXT,
    firmware_profile TEXT,
    metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS lock_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mac_address TEXT,
    event TEXT NOT NULL,
    details TEXT,
    created_at REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resources_chip_status
    ON resources(chip_type, status);
CREATE INDEX IF NOT EXISTS idx_resources_owner_pid
    ON resources(owner_pid);
"""


class SqliteResourceStore:
    """Thread-safe SQLite store for ESP resource state and locks."""

    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._thread_lock = threading.RLock()
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(str(self.db_path), timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA busy_timeout=30000")
        return connection

    def _init_db(self) -> None:
        with self._thread_lock, self._connect() as connection:
            connection.executescript(_SCHEMA)
            self._ensure_column(connection, "resources", "last_released_at", "REAL")
            connection.commit()

    @staticmethod
    def _ensure_column(connection: sqlite3.Connection, table: str, column: str, ddl: str) -> None:
        """Add missing columns for forward-compatible schema upgrades."""
        columns = {
            row[1] for row in connection.execute(f"PRAGMA table_info({table})").fetchall()
        }
        if column not in columns:
            connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")

    def _record_event(self, connection: sqlite3.Connection, mac_address: str, event: str, details: str = "") -> None:
        connection.execute(
            "INSERT INTO lock_events (mac_address, event, details, created_at) VALUES (?, ?, ?, ?)",
            (mac_address, event, details, time.time()),
        )

    def upsert_discovered_device(
        self,
        mac_address: str,
        chip_type: str,
        port: str,
        serial_number: Optional[str] = None,
        usb_path: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Insert or refresh a discovered device without stealing active locks."""
        now = time.time()
        metadata_json = json.dumps(metadata or {})
        with self._thread_lock, self._connect() as connection:
            row = connection.execute(
                "SELECT status, owner_pid FROM resources WHERE mac_address = ?",
                (mac_address,),
            ).fetchone()
            if row is None:
                connection.execute(
                    """
                    INSERT INTO resources (
                        mac_address, chip_type, port, serial_number, usb_path,
                        status, last_seen_at, metadata_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        mac_address,
                        chip_type,
                        port,
                        serial_number,
                        usb_path,
                        ResourceStatus.AVAILABLE.value,
                        now,
                        metadata_json,
                    ),
                )
                self._record_event(connection, mac_address, "discovered", port)
            else:
                connection.execute(
                    """
                    UPDATE resources
                    SET chip_type = ?, port = ?, serial_number = ?, usb_path = ?,
                        last_seen_at = ?, metadata_json = ?,
                        status = CASE
                            WHEN status = 'offline' THEN 'available'
                            WHEN status = 'failed' AND owner_pid IS NULL THEN 'available'
                            ELSE status
                        END
                    WHERE mac_address = ?
                    """,
                    (chip_type, port, serial_number, usb_path, now, metadata_json, mac_address),
                )
            connection.commit()

    def release_stale_locks(self) -> int:
        """Reclaim locks whose owner process is gone."""
        now = time.time()
        reclaimed = 0
        with self._thread_lock, self._connect() as connection:
            rows = connection.execute(
                """
                SELECT mac_address, owner_pid, lock_expires_at, status
                FROM resources
                WHERE owner_pid IS NOT NULL
                """
            ).fetchall()
            for row in rows:
                if _pid_alive(row["owner_pid"]):
                    continue
                expired = bool(row["lock_expires_at"]) and row["lock_expires_at"] < now
                connection.execute(
                    """
                    UPDATE resources
                    SET status = ?, owner_pid = NULL, owner_job_id = NULL, owner_test = NULL,
                        lock_acquired_at = NULL, lock_expires_at = NULL
                    WHERE mac_address = ?
                    """,
                    (ResourceStatus.AVAILABLE.value, row["mac_address"]),
                )
                self._record_event(
                    connection,
                    row["mac_address"],
                    "stale_lock_reclaimed",
                    f"pid_dead=True, expired={expired}",
                )
                reclaimed += 1
            connection.commit()
        if reclaimed:
            logger.info("Reclaimed %s stale hardware lock(s)", reclaimed)
        return reclaimed

    def try_reserve(
        self,
        chip_type: str,
        owner_pid: int,
        owner_job_id: str,
        owner_test: str,
        lease_seconds: int,
    ) -> Optional[Dict[str, Any]]:
        """Atomically reserve the first available device of chip_type."""
        self.release_stale_locks()
        chip_type = chip_type.lower()
        now = time.time()
        expires_at = now + lease_seconds
        with self._thread_lock, self._connect() as connection:
            candidates = connection.execute(
                """
                SELECT * FROM resources
                WHERE lower(chip_type) = ? AND status = ?
                ORDER BY COALESCE(last_released_at, 0) ASC, last_seen_at DESC
                """,
                (chip_type, ResourceStatus.AVAILABLE.value),
            ).fetchall()
            # Skip vanished ports and ports/MACs excluded via $ESP_EXCLUDE_PORTS / $ESP_EXCLUDE_MACS.
            excluded_ports = [t.strip().lower() for t in (os.getenv("ESP_EXCLUDE_PORTS") or "").split(",") if t.strip()]
            excluded_macs = [m.strip().upper() for m in (os.getenv("ESP_EXCLUDE_MACS") or "").split(",") if m.strip()]
            row = None
            for candidate in candidates:
                port = candidate["port"] or ""
                if excluded_ports and any(token in port.lower() for token in excluded_ports):
                    continue
                if excluded_macs and (candidate["mac_address"] or "").upper() in excluded_macs:
                    continue
                if port and os.path.exists(port):
                    row = candidate
                    break
                connection.execute(
                    "UPDATE resources SET status = ? WHERE mac_address = ?",
                    (ResourceStatus.OFFLINE.value, candidate["mac_address"]),
                )
                self._record_event(
                    connection, candidate["mac_address"], "offline_port_missing", candidate["port"]
                )
            if row is None:
                connection.commit()
                return None
            updated = connection.execute(
                """
                UPDATE resources
                SET status = ?, owner_pid = ?, owner_job_id = ?, owner_test = ?,
                    lock_acquired_at = ?, lock_expires_at = ?
                WHERE mac_address = ? AND status = ?
                """,
                (
                    ResourceStatus.RESERVED.value,
                    owner_pid,
                    owner_job_id,
                    owner_test,
                    now,
                    expires_at,
                    row["mac_address"],
                    ResourceStatus.AVAILABLE.value,
                ),
            )
            if updated.rowcount != 1:
                return None
            self._record_event(connection, row["mac_address"], "reserved", owner_test)
            connection.commit()
            return dict(row)

    def try_reserve_mac(
        self,
        mac_address: str,
        owner_pid: int,
        owner_job_id: str,
        owner_test: str,
        lease_seconds: int,
    ) -> Optional[Dict[str, Any]]:
        """Atomically reserve one SPECIFIC device by MAC (e.g. the Matter chip), ignoring the type-pool $ESP_EXCLUDE_* so it stays reservable."""
        self.release_stale_locks()
        mac_up = (mac_address or "").upper()
        now = time.time()
        expires_at = now + lease_seconds
        with self._thread_lock, self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM resources WHERE upper(mac_address) = ? AND status = ?",
                (mac_up, ResourceStatus.AVAILABLE.value),
            ).fetchone()
            if row is None:
                connection.commit()
                return None
            port = row["port"] or ""
            if not (port and os.path.exists(port)):
                connection.execute(
                    "UPDATE resources SET status = ? WHERE mac_address = ?",
                    (ResourceStatus.OFFLINE.value, row["mac_address"]),
                )
                self._record_event(connection, row["mac_address"], "offline_port_missing", port)
                connection.commit()
                return None
            updated = connection.execute(
                """
                UPDATE resources
                SET status = ?, owner_pid = ?, owner_job_id = ?, owner_test = ?,
                    lock_acquired_at = ?, lock_expires_at = ?
                WHERE mac_address = ? AND status = ?
                """,
                (
                    ResourceStatus.RESERVED.value,
                    owner_pid,
                    owner_job_id,
                    owner_test,
                    now,
                    expires_at,
                    row["mac_address"],
                    ResourceStatus.AVAILABLE.value,
                ),
            )
            if updated.rowcount != 1:
                return None
            self._record_event(connection, row["mac_address"], "reserved_mac", owner_test)
            connection.commit()
            return dict(row)

    def active_reserved_ports(self) -> list:
        """Ports held by a LIVE reservation — discovery must not probe these (esptool chip-id resets the board mid-use)."""
        with self._thread_lock, self._connect() as connection:
            rows = connection.execute(
                "SELECT port, owner_pid FROM resources WHERE status = ? AND owner_pid IS NOT NULL",
                (ResourceStatus.RESERVED.value,),
            ).fetchall()
        return [row["port"] for row in rows if row["port"] and row["owner_pid"] and _pid_alive(row["owner_pid"])]

    def update_status(self, mac_address: str, status: ResourceStatus, error: str = "") -> None:
        """Update lifecycle status for a resource."""
        with self._thread_lock, self._connect() as connection:
            connection.execute(
                """
                UPDATE resources
                SET status = ?, last_error = CASE WHEN ? != '' THEN ? ELSE last_error END
                WHERE mac_address = ?
                """,
                (status.value, error, error, mac_address),
            )
            self._record_event(connection, mac_address, f"status:{status.value}", error)
            connection.commit()

    def release(self, mac_address: str) -> None:
        """Release a resource back to the available pool."""
        now = time.time()
        with self._thread_lock, self._connect() as connection:
            connection.execute(
                """
                UPDATE resources
                SET status = ?, owner_pid = NULL, owner_job_id = NULL, owner_test = NULL,
                    lock_acquired_at = NULL, lock_expires_at = NULL, last_released_at = ?
                WHERE mac_address = ?
                """,
                (ResourceStatus.AVAILABLE.value, now, mac_address),
            )
            self._record_event(connection, mac_address, "released", "")
            connection.commit()


def _pid_alive(pid: int) -> bool:
    """Return True when a process id is still running."""
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False
