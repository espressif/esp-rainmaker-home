# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Shared utilities used across the automation framework.
"""
import hashlib
import os
import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)


# --- Filename utilities ---

def safe_test_name(test_name: str, max_len: int = 80) -> str:
    """
    Sanitize test name for use in file paths.
    Removes/replaces characters that cause filesystem issues and truncates long names.

    Args:
        test_name: Raw test name (e.g. pytest nodeid or parametrized name)
        max_len: Max length before truncation with hash suffix (default 80)

    Returns:
        Filesystem-safe string
    """
    if not test_name:
        return "unknown"
    safe = re.sub(r'[^\w\-.]', '_', str(test_name))
    safe = re.sub(r'_+', '_', safe).strip('_')
    if not safe:
        return "unknown"
    if len(safe) <= max_len:
        return safe
    digest = hashlib.md5(safe.encode("utf-8")).hexdigest()[:8]
    return f"{safe[:max_len - 9]}_{digest}"


# --- Test input normalization (Gherkin tokens) ---

def normalize_input(value: str) -> str:
    """
    Normalize strings from Gherkin feature files.
    Handles tokens like <space>, <tab>, <nl>, <empty>, "" and ''.

    Args:
        value: Raw string from step parameter

    Returns:
        Normalized string
    """
    if value is None:
        return ""
    if value in {'""', "''", "<empty>"}:
        return ""
    return (
        value.replace("<space>", " ")
        .replace("<tab>", "\t")
        .replace("<nl>", "\n")
    )


def read_app_version() -> str:
    """Return the app version under test from package.json `version`."""
    from pathlib import Path

    repo_root = Path(__file__).resolve().parents[2]
    try:
        import json

        package_json = repo_root / "package.json"
        if package_json.exists():
            return str(json.loads(package_json.read_text()).get("version", ""))
    except Exception as error:
        logger.warning("Could not read app version: %s", error)
    return ""


def read_commit_id() -> str:
    """Return the short git commit id for the build under test.

    Mirrors app.config.ts's resolveCommitId so the expected version string
    matches what the app displays: prefer the CI-provided value (GitLab
    CI_COMMIT_SHORT_SHA, or an explicit APP_COMMIT_ID override), then fall back
    to `git rev-parse --short HEAD`. Returns "" when unavailable.
    """
    import os
    import subprocess
    from pathlib import Path

    env_value = os.environ.get("CI_COMMIT_SHORT_SHA") or os.environ.get("APP_COMMIT_ID")
    if env_value:
        return env_value.strip()
    try:
        repo_root = Path(__file__).resolve().parents[2]
        return (
            subprocess.check_output(
                ["git", "rev-parse", "--short", "HEAD"],
                cwd=str(repo_root),
                stderr=subprocess.DEVNULL,
            )
            .decode()
            .strip()
        )
    except Exception as error:
        logger.warning("Could not read commit id: %s", error)
        return ""


def read_device_app_version(platform: str, identifier: str, udid: Optional[str] = None, adb_path: str = "adb") -> str:
    """Return the app version actually installed on the connected device.

    Android: `adb shell dumpsys package <package>` -> versionName.
    iOS: `ideviceinstaller -l` -> the version quoted next to <bundle_id>.
    Returns "" on any failure so callers can fall back to the repo version.
    """
    import subprocess

    platform = (platform or "").lower()
    if not identifier:
        return ""
    try:
        if platform == "android":
            cmd = [adb_path] + (["-s", udid] if udid else []) + ["shell", "dumpsys", "package", identifier]
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=15).stdout
            match = re.search(r"versionName=(\S+)", out)
            return match.group(1).strip() if match else ""
        if platform == "ios":
            # devicectl (ships with Xcode) lists "<name> <bundle_id> <version> <build>".
            if udid:
                out = subprocess.run(
                    ["xcrun", "devicectl", "device", "info", "apps", "--device", udid],
                    capture_output=True, text=True, timeout=30,
                ).stdout
                for line in out.splitlines():
                    if identifier in line:
                        after = line.split(identifier, 1)[1]
                        match = re.search(r"(\d+\.\d+(?:\.\d+)?)", after)
                        if match:
                            return match.group(1)
            out = subprocess.run(
                ["ideviceinstaller"] + (["-u", udid] if udid else []) + ["-l"],
                capture_output=True, text=True, timeout=25,
            ).stdout
            for line in out.splitlines():
                if identifier in line:
                    quoted = re.search(r'"([0-9][^"]*)"', line)
                    if quoted:
                        return quoted.group(1).strip()
            return ""
    except Exception as error:
        logger.warning("Could not read device app version (%s): %s", platform, error)
    return ""


def git_ref_info() -> dict:
    """Branch/MR info from CI env vars, falling back to local git branch."""
    import subprocess
    from pathlib import Path
    branch = os.environ.get("CI_COMMIT_REF_NAME") or os.environ.get("GIT_BRANCH") or ""
    info = {
        "branch": branch,
        "mr_iid": os.environ.get("CI_MERGE_REQUEST_IID", "").strip(),
        "mr_title": os.environ.get("CI_MERGE_REQUEST_TITLE", "").strip(),
    }
    if not info["branch"]:
        try:
            repo_root = Path(__file__).resolve().parents[2]
            info["branch"] = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=str(repo_root), capture_output=True, text=True, timeout=5,
            ).stdout.strip()
        except Exception:
            pass
    return info


# --- Artifact resolution ---

def resolve_single_artifact(
    artifact_host,
    source_path: str,
    artifact_type: str,
    run_id: str,
    test_name: str = None,
) -> Optional[str]:
    """
    Organize one artifact and return its URL.
    Uses safe_test_name for target filenames to avoid path length limits.

    Args:
        artifact_host: ArtifactHost instance
        source_path: Path to artifact file
        artifact_type: screenshot, video, log, page_source
        run_id: Test run ID
        test_name: Optional test name for organization

    Returns:
        URL string or None
    """
    if not artifact_host or not source_path or not os.path.exists(source_path):
        return None
    safe_name = safe_test_name(test_name or "unknown", max_len=80) if test_name else None
    if run_id:
        artifact_host.current_run_id = run_id
    try:
        result = artifact_host.organize_artifact(
            source_path, artifact_type, test_name=safe_name, run_id=run_id
        )
        return result.get("url") if result else None
    except Exception as e:
        logger.warning("Failed to organize %s: %s", artifact_type, e)
        return None
