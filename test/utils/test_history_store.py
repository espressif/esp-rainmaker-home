# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Shared shape for test_history.json, used by the report plugin (writer) and the
report generator (reader).

Two stores, because they answer different questions and must not evict each other:
`runs` is a rolling window of recent runs, while `releases` keeps the latest run
per release/* branch — a burst of MR runs used to trim release entries out of the
single capped list, which is why a release row could vanish from the report.
"""
from typing import Dict, List

from utils.common_utils import is_release_branch, normalize_branch

SCHEMA_VERSION = 2
MAX_RUNS_PER_TEST = 20
MAX_RELEASES_PER_TEST = 5


def normalize_store(raw) -> Dict:
    """Accept schema 1 (bare nodeid -> runs mapping) or 2; always return schema 2."""
    if isinstance(raw, dict) and raw.get("schema") == SCHEMA_VERSION:
        return {
            "schema": SCHEMA_VERSION,
            "runs": raw.get("runs") or {},
            "releases": raw.get("releases") or {},
        }
    runs = raw if isinstance(raw, dict) else {}
    # Schema 1 kept no release store; recover one from the runs already on disk so
    # historical release rows survive the upgrade instead of reading as empty.
    releases: Dict[str, List] = {}
    for nodeid, entries in runs.items():
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if isinstance(entry, dict) and is_release_branch(entry.get("branch")):
                releases.setdefault(nodeid, [])
                releases[nodeid] = merge_release(releases[nodeid], entry)
    return {"schema": SCHEMA_VERSION, "runs": runs, "releases": releases}


def merge_release(entries: List, record: Dict) -> List:
    """Keyed by source branch: a newer run for the same release/* branch replaces the older one."""
    branch = normalize_branch(record.get("branch"))
    kept = [e for e in entries if normalize_branch(e.get("branch")) != branch]
    kept.append(record)
    kept.sort(key=lambda e: str(e.get("ts_iso") or ""))
    return kept[-MAX_RELEASES_PER_TEST:]


def matches_context(entry: Dict, platform: str = "", deployment: str = "", active_sdk: str = "") -> bool:
    """Context filter where an unset field on the record is a wildcard, so records written
    before deployment/SDK tagging existed stay visible instead of being silently dropped."""
    def norm(value) -> str:
        return str(value or "").strip().lower()

    if platform and norm(entry.get("platform")) != norm(platform):
        return False
    for wanted, key in ((deployment, "deployment"), (active_sdk, "active_sdk")):
        recorded = norm(entry.get(key))
        if wanted and recorded and recorded != norm(wanted):
            return False
    return True
