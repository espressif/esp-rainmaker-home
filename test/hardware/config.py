# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Load hardware and provisioning configuration from esp_devices.yaml."""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, Dict, Optional

import yaml

_ENV_PATTERN = re.compile(r"\$\{([^}:]+)(?::-([^}]*))?\}")

# test/ package root — anchor for all relative paths in esp_devices.yaml,
# independent of where the config file itself lives.
_TEST_ROOT = Path(__file__).resolve().parents[1]


def _expand_env(value: str) -> str:
    """Expand ${VAR:-default} placeholders in YAML string values."""

    def _replace(match: re.Match[str]) -> str:
        key = match.group(1)
        default = match.group(2) or ""
        return os.environ.get(key, default)

    return _ENV_PATTERN.sub(_replace, value)


def _expand_tree(node: Any) -> Any:
    """Recursively expand environment variables in loaded YAML."""
    if isinstance(node, dict):
        return {key: _expand_tree(value) for key, value in node.items()}
    if isinstance(node, list):
        return [_expand_tree(item) for item in node]
    if isinstance(node, str):
        return _expand_env(node)
    return node


class HardwareConfig:
    """Parsed esp_devices.yaml for Wi-Fi, firmware, and hardware manager settings."""

    def __init__(self, raw: Dict[str, Any], config_path: Path):
        self.config_path = config_path
        self.raw = raw
        self.wifi = raw.get("wifi", {})
        self.firmware_repository = raw.get("firmware_repository", {})
        self.hardware = raw.get("hardware", {})

    @property
    def ssid(self) -> str:
        """Lab Wi-Fi SSID shared by all provisioning tests."""
        return str(self.wifi.get("ssid", ""))

    @property
    def ssid_password(self) -> str:
        """Lab Wi-Fi password shared by all provisioning tests."""
        return str(self.wifi.get("ssid_password", ""))

    def provision_value(self, token: str) -> str:
        """
        Resolve a feature-file provisioning token from the wifi section.

        @param token - e.g. "ssid", "ssid_password" (spaces map to underscores)
        @returns Config value; "" is valid for ssid_password (open networks)
        """
        key = token.strip().lower().replace(" ", "_")
        if key not in self.wifi:
            raise KeyError(
                f"Provisioning token '{token}' not set in esp_devices.yaml wifi section"
            )
        value = str(self.wifi.get(key) or "")
        if not value and key != "ssid_password":
            raise KeyError(
                f"Provisioning token '{token}' is empty in esp_devices.yaml wifi section"
            )
        return value

    @property
    def lock_db_path(self) -> Path:
        """SQLite resource-lock db path; $ESP_LOCK_DB_PATH (one shared absolute path across parallel executors) wins over the yaml/default."""
        default = Path("hardware/.resource_locks.db")
        configured = os.environ.get("ESP_LOCK_DB_PATH") or self.hardware.get("lock_db_path", str(default))
        path = Path(configured).expanduser()
        if not path.is_absolute():
            path = _TEST_ROOT / path
        return path

    @property
    def lock_stale_seconds(self) -> int:
        """Seconds before an orphaned lock is reclaimed."""
        return int(self.hardware.get("lock_stale_seconds", 3600))

    @property
    def acquire_timeout_seconds(self) -> int:
        """Default acquire timeout when waiting for a free device."""
        return int(self.hardware.get("acquire_timeout_seconds", 300))

    @property
    def firmware_root(self) -> Path:
        """Directory containing per-chip firmware bundles (or a single bundle)."""
        configured = self.firmware_repository.get(
            "root_dir",
            os.environ.get("FIRMWARE_ROOT", "firmwares"),
        )
        path = Path(str(configured)).expanduser()
        if not path.is_absolute():
            path = (_TEST_ROOT / path).resolve()
        return path

    @property
    def firmware_type(self) -> str:
        """Evaluation or OTA artifact set inside the firmware bundle."""
        return str(self.firmware_repository.get("firmware_type", "Evaluation"))

    @property
    def esptool_path(self) -> str:
        """esptool executable or module invocation."""
        return str(self.hardware.get("esptool_path", "python -m esptool"))

    @classmethod
    def load(cls, config_path: Optional[Path] = None) -> "HardwareConfig":
        """Load esp_devices.yaml from test/config."""
        path = config_path or Path("config/esp_devices.yaml")
        with open(path, encoding="utf-8") as handle:
            raw = _expand_tree(yaml.safe_load(handle) or {})
        return cls(raw, path.resolve())
