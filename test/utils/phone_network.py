# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Host-side adb network control for the test phone — force cloud-only transport (Android only)."""
import logging
import subprocess
import time
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)


from functools import lru_cache


@lru_cache(maxsize=1)
def _resolve_adb() -> str:
    app_config_path = Path(__file__).resolve().parents[1] / "config" / "app.yaml"
    try:
        with open(app_config_path, "r") as f:
            app_config = yaml.safe_load(f) or {}
    except Exception:
        return "adb"
    rainmaker = app_config.get("rainmaker-home", {})
    android_path = rainmaker.get("android_path")
    return rainmaker.get("adb_path") or (
        f"{android_path.rstrip('/')}/platform-tools/adb" if android_path else "adb"
    )


def adb_prefix(driver) -> list:
    """Resolved adb command prefix for the driver's device (adds -s <udid> when known)."""
    udid = driver.capabilities.get("udid")
    return [_resolve_adb()] + (["-s", udid] if udid else [])


class PhoneNetwork:
    def __init__(self, driver):
        caps = driver.capabilities
        self.platform = caps.get("platformName", "Android").lower()
        self.udid = caps.get("udid") or caps.get("deviceUDID")
        self.adb = _resolve_adb()

    def _shell(self, *args, timeout=15):
        if self.platform != "android":
            raise RuntimeError("PhoneNetwork is Android-only")
        cmd = [self.adb] + (["-s", self.udid] if self.udid else []) + ["shell", *args]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        logger.info("adb shell %s -> rc=%s %s", " ".join(args), result.returncode, (result.stdout or "").strip()[:120])
        return result

    def set_mobile_data(self, enabled: bool):
        self._shell("svc", "data", "enable" if enabled else "disable")
        return self

    def has_internet(self, timeout=30):
        """Poll until the phone can reach the internet (ping 8.8.8.8), else False."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                result = self._shell("ping", "-c", "1", "-W", "2", "8.8.8.8", timeout=10)
                if result.returncode == 0 and " 0% packet loss" in (result.stdout or ""):
                    return True
            except Exception as error:
                logger.warning("Connectivity probe failed: %s", error)
            time.sleep(2)
        return False
