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
    """Return the app version under test from .env (APP_VERSION) or package.json."""
    from pathlib import Path

    repo_root = Path(__file__).resolve().parents[2]
    env_path = repo_root / ".env"
    try:
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.strip().startswith("APP_VERSION="):
                    version = line.split("=", 1)[1].strip().strip('"').strip("'")
                    if version:
                        return version
        import json
        package_json = repo_root / "package.json"
        if package_json.exists():
            return str(json.loads(package_json.read_text()).get("version", ""))
    except Exception as error:
        logger.warning("Could not read app version: %s", error)
    return ""


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
