# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Config-scan page helper: switch the app's active deployment/SDK at runtime by scanning a config QR (5 logo taps → scan → restart), reset back with 10 taps."""

import json
import logging
import time

from hardware.qr import QrDisplay

from .base import BasePage

logger = logging.getLogger(__name__)


class ConfigScan(BasePage):
    def _tap_logo(self, times, window_ms=1000):
        """Tap the login logo `times` within one detection window."""
        logo = self.find_visible("logo_login", timeout=10)
        if not logo:
            raise RuntimeError("Login logo not visible; not on the login screen")
        interval = (window_ms / 1000.0) / (times + 1)
        for _ in range(times):
            logo.click()
            time.sleep(interval)

    def open_config_scan(self):
        """5 rapid taps on the login logo opens the Config Scan screen."""
        self._tap_logo(5)
        if not self.is_visible("button_update_config", timeout=10):
            raise RuntimeError("Config Scan screen did not open after 5 logo taps")
        return self

    def reset_runtime_config(self):
        """10 rapid taps resets to the compile-time SDK (a confirm dialog + restart follow)."""
        self._tap_logo(10)
        return self

    def switch_via_qr(self, sdk, config, per_test_debug_dir, platform="android", settle=25):
        """Open config scan, display the {sdk, config} QR for the camera, and wait for the app to apply + restart."""
        self.open_config_scan()
        self.click("button_update_config", timeout=10)
        self.get_other_page_helper("permissions").handle_all_permissions(action="allow", timeout=6)
        payload = json.dumps({"sdk": sdk, "config": config}, separators=(",", ":"))
        QrDisplay.show(payload, per_test_debug_dir.root, platform=platform)
        try:
            if not self.is_visible("text_config_scan_success", timeout=settle):
                if self.is_visible("text_config_scan_error", timeout=1):
                    raise RuntimeError(f"Config scan failed: {self.get_text('text_config_scan_error')}")
                logger.warning("No success/error view within %ss; app may already be restarting", settle)
        finally:
            QrDisplay.close()
        return self

    def active_sdk(self, timeout=10):
        """Read the Active SDK value shown on the Config Scan info screen."""
        self.open_config_scan()
        return self.get_text("text_active_sdk", timeout=timeout)
