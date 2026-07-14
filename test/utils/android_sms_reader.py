# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Read the Apple 2FA verification code from an SMS on the Android device under test (adb inbox, notification fallback)."""
import logging
import re
import subprocess
import time

logger = logging.getLogger(__name__)

_APPLE_CODE_RE = re.compile(r"code is:?\s*(\d{4,8})", re.IGNORECASE)
_APPLE_CODE_FALLBACK = re.compile(r"(?:^|[#\s])(\d{6})(?:$|[.\s])")
_APPLE_HINT = re.compile(r"apple|verification code", re.IGNORECASE)


def _extract_code(text):
    match = _APPLE_CODE_RE.search(text) or _APPLE_CODE_FALLBACK.search(text)
    return match.group(1) if match else None


def _adb(udid, adb_path, *args, timeout=15):
    cmd = [adb_path] + (["-s", udid] if udid else []) + list(args)
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def _rows_from_sms(udid, adb_path):
    """(date_ms, body) tuples from the SMS inbox, newest first; empty on any failure."""
    try:
        result = _adb(
            udid, adb_path, "shell", "content", "query", "--uri", "content://sms/inbox",
            "--projection", "date:body",
        )
    except Exception as error:
        logger.warning("adb SMS query failed: %s", error)
        return []
    if result.returncode != 0 or "SecurityException" in (result.stderr or ""):
        logger.info("SMS provider not readable via adb shell (%s); will try notifications",
                    (result.stderr or "").strip()[:120])
        return []
    rows = []
    for line in (result.stdout or "").splitlines():
        if not line.startswith("Row:"):
            continue
        date_match = re.search(r"date=(\d+)", line)
        body_match = re.search(r"body=(.*)$", line)
        if body_match:
            rows.append((int(date_match.group(1)) if date_match else 0, body_match.group(1)))
    rows.sort(key=lambda r: r[0], reverse=True)  # newest first, without relying on --sort
    return rows


def _code_from_notifications(udid, adb_path):
    """Fallback: scrape a just-arrived Apple code out of the notification shade dump."""
    try:
        result = _adb(udid, adb_path, "shell", "dumpsys", "notification", "--noredact", timeout=20)
    except Exception as error:
        logger.warning("adb notification dump failed: %s", error)
        return None
    for line in (result.stdout or "").splitlines():
        if _APPLE_HINT.search(line):
            code = _extract_code(line)
            if code:
                return code
    return None


def _device_now_ms(udid, adb_path):
    try:
        result = _adb(udid, adb_path, "shell", "date", "+%s%3N")
        return int((result.stdout or "").strip())
    except Exception:
        return 0


def fetch_apple_2fa_code_from_sms(udid=None, adb_path="adb", timeout=120, poll=3, fresh_window_ms=120000):
    """Poll for the Apple 2FA code SMS within `fresh_window_ms` and return the code (or None within `timeout`)."""
    now_ms = _device_now_ms(udid, adb_path) or int(time.time() * 1000)
    cutoff = now_ms - fresh_window_ms
    deadline = time.time() + timeout
    while time.time() < deadline:
        for date_ms, body in _rows_from_sms(udid, adb_path):  # newest first
            if date_ms < cutoff or not _APPLE_HINT.search(body):
                continue
            code = _extract_code(body)
            if code:
                logger.info("Read Apple 2FA code from a fresh SMS")
                return code
        time.sleep(poll)
    code = _code_from_notifications(udid, adb_path)
    if code:
        logger.warning("No fresh Apple SMS via content provider; used notification-shade code (may be stale)")
        return code
    logger.warning("No Apple 2FA SMS code arrived within %ss", timeout)
    return None
