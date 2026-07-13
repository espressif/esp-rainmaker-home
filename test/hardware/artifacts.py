# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Per-test debug artifact directory layout."""
from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional

from hardware.models import EspResource
from utils.common_utils import safe_test_name


def timestamped_test_folder_name(test_node, max_name_len: int = 80) -> str:
    """
    Build a sortable debug folder name: YYYYMMDD_HHMMSS_<test_name>.

    @param test_node - Pytest item/node
    @returns Folder name under debug/
    """
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    name = getattr(test_node, "originalname", None) or test_node.name.split("[")[0]
    safe = safe_test_name(name, max_len=max_name_len)
    return f"{stamp}_{safe}"


class TestArtifactDir:
    """
    Unified artifact folder for one test execution.

    Layout:
      test/debug/20260611_083015_test_<name>/
        esp32c3_84f70319d7e0.log
        android_logcat.log
        screenshot_<model>.png
        recording.mp4
    """

    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    @property
    def name(self) -> str:
        """Folder name (timestamp_test_name), used to label organized artifacts."""
        return self.root.name

    @classmethod
    def for_test(cls, test_node, debug_root: str = "debug") -> "TestArtifactDir":
        """Create timestamped artifact directory from a pytest node."""
        folder = timestamped_test_folder_name(test_node)
        return cls(Path(debug_root) / folder)

    def serial_log_path(self, resource: EspResource) -> Path:
        """Serial log filename: <chip>_<mac_without_separators>.log"""
        mac = resource.mac_address.replace(":", "").lower()
        chip = resource.chip_type.lower()
        return self.root / f"{chip}_{mac}.log"

    def android_logcat_log(self) -> Path:
        """Android logcat path for this test."""
        return self.root / "android_logcat.log"

    def ios_syslog_log(self) -> Path:
        """iOS device syslog path for this test."""
        return self.root / "ios_syslog.log"

    def ios_crash_log(self) -> Path:
        """Aggregated iOS app crash reports (.ips) path for this test."""
        return self.root / "ios_crash.log"

    def copy_file(self, source: Optional[str], destination: Path) -> Optional[Path]:
        """Copy an external log file into the test artifact directory."""
        if not source:
            return None
        src = Path(source)
        if not src.exists():
            return None
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, destination)
        return destination

    def list_artifacts(self) -> dict:
        """Return relative artifact paths for report attachment."""
        files = {}
        for path in sorted(self.root.glob("*")):
            if path.is_file():
                files[path.name] = str(path.resolve())
        return files
