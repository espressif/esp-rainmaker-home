# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Provisioning QR support: payload extraction from serial logs and on-screen display."""
from __future__ import annotations

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
            return url_match.group(1).strip()

        payload_match = _QR_PAYLOAD_PATTERN.search(clean)
        if payload_match:
            return payload_match.group(1)
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


ScreenSide = Literal["left", "right"]


class QrDisplay:
    """Render a provisioning QR PNG and show it on the host display for camera scanning."""

    # Set when a QR is shown, so close() only acts for scan-QR tests and never
    # touches Preview after a non-scan test (BLE/SoftAP/on-network).
    _active: bool = False

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
        """Silently close the provisioning QR preview once scanning is done."""
        # Only act when a QR was actually shown (scan-QR tests). Other suites
        # never open Preview, so closing/quitting it would disrupt the host.
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
            subprocess.run(["osascript", "-e", script], capture_output=True, check=False, timeout=15)
            logger.info("Provisioning QR preview closed")
        except subprocess.TimeoutExpired:
            logger.warning("Closing QR preview timed out (Automation permission not granted?)")

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
            bounds_setup = f"set winBounds to {{{screen_w - 550}, 80, {screen_w - 150}, 520}}"

        script = f'''
        set pngPath to POSIX file "{png_abs}"
        {bounds_setup}
        tell application "Preview"
            activate
            open pngPath
        end tell
        delay 0.8
        tell application "Preview"
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
            # osascript blocks on the macOS Automation prompt ("<runner> wants to
            # control Preview") when that permission hasn't been granted on this
            # host. Don't hang the test — just open the image unpositioned.
            logger.warning("Preview AppleScript timed out (grant Automation control of Preview); opening unpositioned")
            opened = subprocess.run(["open", "-a", "Preview", png_abs], check=False)
            return opened.returncode == 0
        if result.returncode != 0:
            # QR is still shown, just not positioned — good enough for scanning.
            logger.warning("Preview window positioning failed: %s", result.stderr.strip())
            opened = subprocess.run(["open", "-a", "Preview", png_abs], check=False)
            return opened.returncode == 0
        logger.info("QR displayed via Preview on %s side", side)
        return True
