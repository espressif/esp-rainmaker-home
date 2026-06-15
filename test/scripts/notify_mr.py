# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

#!/usr/bin/env python3
"""
Post the test report link as a comment on the merge request that triggered
the GitLab CI pipeline.

Reads reports/last_run_summary.json (written by pytest_report_plugin at
session finish) and uses GitLab predefined CI variables. Requires a
GITLAB_MR_TOKEN CI variable (project access token with `api` scope) — the
default CI_JOB_TOKEN cannot create MR notes.

Never fails the job: missing token / non-MR pipeline exits 0 with a log line.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

SUMMARY_FILE = Path(os.environ.get("RUN_SUMMARY_FILE", "reports/last_run_summary.json"))


def _platform_label() -> str:
    """Derive the platform from the CI job name (android_test / ios_test)."""
    job_name = os.environ.get("CI_JOB_NAME", "").lower()
    if "ios" in job_name:
        return "iOS"
    if "android" in job_name:
        return "Android"
    return "Mobile App"


def _build_note(summary: dict) -> str:
    """Render the MR comment body from the run summary."""
    status_icon = {"ALL PASSED": "✅", "PASSED": "✅", "MOSTLY PASSED": "⚠️"}.get(summary.get("status"), "❌")
    report_url = summary.get("report_url") or "report URL unavailable (artifact host offline?)"
    device = f" on {summary['model']}" if summary.get("model") else ""
    lines = [
        f"## {status_icon} {_platform_label()} Test Report — {summary.get('status', 'UNKNOWN')}{device}",
        "",
        "| Total | Pass | Fail | Skip | Abort |",
        "|-------|------|------|------|-------|",
        f"| {summary.get('total_tests', 0)} | {summary.get('total_pass', 0)} "
        f"| {summary.get('total_fail', 0)} | {summary.get('total_skip', 0)} "
        f"| {summary.get('total_abort', 0)} |",
        "",
        f"**Report:** {report_url}",
        "",
        f"_Run ID: {summary.get('run_id', 'n/a')} — triggered by "
        f"{os.environ.get('GITLAB_USER_NAME', 'unknown')}_",
    ]
    return "\n".join(lines)


def main() -> int:
    mr_iid = os.environ.get("CI_MERGE_REQUEST_IID")
    project_id = os.environ.get("CI_PROJECT_ID")
    api_url = (os.environ.get("CI_API_V4_URL") or "").rstrip("/")
    token = os.environ.get("GITLAB_MR_TOKEN") or os.environ.get("GITLAB_TOKEN")

    if not (mr_iid and project_id and api_url):
        print("notify_mr: not a merge request pipeline — skipping MR comment")
        return 0
    if not token:
        print("notify_mr: GITLAB_MR_TOKEN not configured — skipping MR comment")
        return 0
    if not SUMMARY_FILE.exists():
        print(f"notify_mr: {SUMMARY_FILE} not found — was the test session aborted?")
        return 0

    summary = json.loads(SUMMARY_FILE.read_text())
    note_url = f"{api_url}/projects/{project_id}/merge_requests/{mr_iid}/notes"
    payload = json.dumps({"body": _build_note(summary)}).encode("utf-8")

    request = urllib.request.Request(
        note_url,
        data=payload,
        method="POST",
        headers={
            "PRIVATE-TOKEN": token,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            print(f"notify_mr: comment posted on MR !{mr_iid} (HTTP {response.status})")
    except urllib.error.HTTPError as error:
        print(f"notify_mr: GitLab API error {error.code}: {error.read().decode(errors='replace')[:300]}")
    except Exception as error:  # network issues must not fail the test job
        print(f"notify_mr: failed to post comment: {error}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
