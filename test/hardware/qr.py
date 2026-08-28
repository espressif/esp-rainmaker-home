# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Provisioning QR support: payload extraction from serial logs and on-screen display."""
from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import List, Literal, Optional

from hardware.exceptions import SerialLogError
from hardware.serial import decode_serial_bytes

logger = logging.getLogger(__name__)

_QR_URL_DATA_PATTERN = re.compile(
    r"https://rainmaker\.espressif\.com/qrcode\.html\?data=(.+)$",
    re.IGNORECASE,
)
_QR_JSON_PATTERN = re.compile(r"QRCODE:\s*(\{.+?\})", re.IGNORECASE)
_QR_PAYLOAD_PATTERN = re.compile(r"(NP:[^\s'\"]+|RM:[^\s'\"]+)")
_QR_MATTER_PATTERN = re.compile(r"(MT:[0-9A-HJ-NP-Z.\-]+)")


def _is_complete_payload(candidate: str) -> bool:
    """data=(.+)$ also matches a torn serial line; reject clipped '{' payloads."""
    if not candidate.startswith("{"):
        return True
    try:
        json.loads(candidate)
    except ValueError:
        return False
    return True


class QrPayloadExtractor:
    """Standalone QR parser — does not start/stop serial capture."""

    @staticmethod
    def from_lines(lines: List[str]) -> Optional[str]:
        """Return QR payload from log lines when present."""
        for line in lines:
            payload = QrPayloadExtractor.from_line(line)
            if payload:
                return payload
        return None

    @staticmethod
    def from_line(line: str) -> Optional[str]:
        """Parse a single log line for QR payload."""
        clean = decode_serial_bytes(line.encode("utf-8", errors="replace")) if line else ""
        clean = clean.strip()

        json_match = _QR_JSON_PATTERN.search(clean)
        if json_match:
            return json_match.group(1)

        url_match = _QR_URL_DATA_PATTERN.search(clean)
        if url_match:
            candidate = url_match.group(1).strip()
            if _is_complete_payload(candidate):
                return candidate

        payload_match = _QR_PAYLOAD_PATTERN.search(clean)
        if payload_match:
            return payload_match.group(1)

        matter_match = _QR_MATTER_PATTERN.search(clean)
        if matter_match:
            return matter_match.group(1)
        return None

    @staticmethod
    def from_log_file(log_path: Path, timeout: int = 60, poll_lines: Optional[List[str]] = None) -> str:
        """
        Wait for QR payload to appear in a log file or live line buffer.

        @param log_path - Serial log file path
        @param timeout - Seconds to wait
        @param poll_lines - Optional in-memory lines from active capture
        @returns QR payload string
        """
        deadline = time.time() + timeout
        while time.time() < deadline:
            payload = QrPayloadExtractor.from_lines(list(poll_lines or []))
            if not payload and log_path.exists():
                lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
                payload = QrPayloadExtractor.from_lines(lines)
            if payload:
                return payload
            time.sleep(0.5)
        raise SerialLogError(f"QR payload not found in {log_path} within {timeout}s")

    @staticmethod
    def parse(payload: str) -> dict:
        """Decode a provisioning payload (JSON object or compact 'NP:/RM:<name>|<pop>|<transport>') to {name, pop, transport}."""
        if not payload:
            return {}
        try:
            obj = json.loads(payload)
            return obj if isinstance(obj, dict) else {}
        except (ValueError, TypeError):
            pass
        text = str(payload).strip()
        for prefix in ("NP:", "RM:"):
            if text.startswith(prefix):
                parts = text[len(prefix):].split("|")
                transport_map = {"b": "ble", "s": "softap", "w": "wifi"}
                info = {}
                if parts and parts[0]:
                    info["name"] = parts[0]
                if len(parts) > 1 and parts[1]:
                    info["pop"] = parts[1]
                if len(parts) > 2 and parts[2]:
                    info["transport"] = transport_map.get(parts[2].lower(), parts[2])
                return info
        return {}


ScreenSide = Literal["left", "right"]


class QrDisplay:
    """Render a provisioning QR PNG and show it on the host display for camera scanning."""

    # Set when a QR is shown, so close() only acts for scan-QR tests and never
    # touches Preview after a non-scan test (BLE/SoftAP/on-network).
    _active: bool = False
    _png_path: Optional[Path] = None

    @classmethod
    def show(cls, payload: str, output_dir: Path, platform: str = "android") -> Path:
        """
        Save QR PNG under output_dir and show it on screen.

        Android tests: left side of the Mac display (phone on the left).
        iOS tests: right side of the Mac display (phone on the right).

        @param payload - QR string (JSON or NP:/RM: payload)
        @param output_dir - Test artifact directory
        @param platform - android | ios
        @returns Absolute path to provision_qr.png
        """
        png_path = cls._render_png(payload, output_dir)
        side: ScreenSide = "left" if platform.lower() == "android" else "right"
        cls._active = True
        cls._png_path = png_path

        cls._wake_display()
        if sys.platform == "darwin" and cls._show_preview_macos(png_path, side):
            return png_path

        logger.warning("Open QR manually for scanning: %s", png_path)
        return png_path

    @staticmethod
    def _wake_display() -> None:
        """Dismiss an active screen saver and wake the display."""
        if sys.platform != "darwin":
            return
        subprocess.run(["killall", "ScreenSaverEngine"], capture_output=True, check=False)
        subprocess.run(["caffeinate", "-u", "-t", "1"], capture_output=True, check=False)

    @classmethod
    def close(cls) -> None:
        """Close the QR preview and remove the QR PNG once scanning is done."""
        png = cls._png_path
        cls._png_path = None
        if png:
            try:
                png.unlink()
            except OSError:
                pass
        # Only touch Preview when a QR was actually shown; other suites never open it.
        if not cls._active or sys.platform != "darwin":
            return
        cls._active = False
        script = '''
        tell application "Preview"
            close (every window whose name contains "provision_qr") saving no
            if (count of windows) = 0 then quit
        end tell
        '''
        try:
            result = subprocess.run(["osascript", "-e", script], capture_output=True, check=False, timeout=15)
            if result.returncode == 0:
                logger.info("Provisioning QR preview closed")
                return
            logger.warning("AppleScript close failed (rc=%s, Automation permission?); killing Preview", result.returncode)
        except subprocess.TimeoutExpired:
            logger.warning("Closing QR preview timed out (Automation permission not granted?); killing Preview")
        subprocess.run(["pkill", "-x", "Preview"], capture_output=True, check=False, timeout=10)

    @classmethod
    def _render_png(cls, payload: str, output_dir: Path) -> Path:
        """Render payload to provision_qr.png with error correction for long JSON."""
        try:
            import qrcode
            from qrcode.constants import ERROR_CORRECT_M
        except ImportError as error:
            raise RuntimeError("Install qrcode: pip install 'qrcode[pil]'") from error

        output_dir = Path(output_dir).resolve()
        output_dir.mkdir(parents=True, exist_ok=True)
        png_path = output_dir / "provision_qr.png"

        qr = qrcode.QRCode(
            version=None,
            error_correction=ERROR_CORRECT_M,
            box_size=8,
            border=2,
        )
        qr.add_data(payload)
        qr.make(fit=True)
        qr.make_image(fill_color="black", back_color="white").save(png_path)

        if not png_path.is_file() or png_path.stat().st_size < 64:
            raise RuntimeError(f"QR PNG was not created at {png_path}")
        logger.info("QR PNG saved: %s (%s bytes)", png_path, png_path.stat().st_size)
        return png_path

    @classmethod
    def _show_preview_macos(cls, png_path: Path, side: ScreenSide) -> bool:
        """Open PNG in Preview and position the window left or right."""
        png_abs = str(png_path.resolve())

        if side == "left":
            bounds_setup = "set winBounds to {24, 80, 424, 520}"
        else:
            # Right-align with a wide margin so the camera never sees a partial QR.
            # Screen width comes from QR_SCREEN_WIDTH (default 1440) instead of
            # driving Finder over AppleScript — that avoids a second macOS
            # Automation permission prompt on unattended runners.
            try:
                screen_w = int(os.environ.get("QR_SCREEN_WIDTH", "1440"))
            except ValueError:
                screen_w = 1440
            bounds_setup = f"set winBounds to {{{screen_w - 550}, 200, {screen_w - 150}, 640}}"

        # Launch Preview via `open` and wait until it is running.
        subprocess.run(["open", "-a", "Preview", png_abs], check=False)
        for _ in range(20):
            r = subprocess.run(["osascript", "-e", 'application "Preview" is running'],
                               capture_output=True, text=True, check=False)
            if (r.stdout or "").strip() == "true":
                break
            time.sleep(0.3)

        script = f'''
        {bounds_setup}
        tell application "Preview"
            activate
            tell front window
                set bounds to winBounds
            end tell
        end tell
        '''
        try:
            result = subprocess.run(
                ["osascript", "-e", script],
                capture_output=True,
                text=True,
                check=False,
                timeout=20,
            )
        except subprocess.TimeoutExpired:
            logger.warning("Preview positioning timed out; QR is open unpositioned")
            return True
        if result.returncode != 0:
            logger.warning("Preview window positioning failed: %s", result.stderr.strip())
            return True
        logger.info("QR displayed via Preview on %s side", side)
        return True
