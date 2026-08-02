# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Parallel-safe serial log capture for ESP devices."""
from __future__ import annotations

import logging
import re
import threading
import time
from pathlib import Path
from typing import Dict, Optional

import serial

from hardware.exceptions import SerialLogError
from hardware.models import EspResource

logger = logging.getLogger(__name__)

BAUD_RATE = 115200
SERIAL_READ_TIMEOUT = 0.5
READ_POLL_SECONDS = 0.05
PORT_RELEASE_DELAY_SECONDS = 2.0
POST_RESET_BOOT_DELAY_SECONDS = 0.2
RETRY_MAX = 3
DOWNLOAD_RECOVERY_INTERVAL_SECONDS = 5.0
DOWNLOAD_RECOVERY_MAX_ATTEMPTS = 4
_ANSI_ESCAPE = re.compile(r"\x1b\[[0-9;]*m")
_BOOT_BANNER = re.compile(r"(?:cpu_start|app_init):\s+(Project name|App version):\s+(\S+)")


def booted_firmware(log_path) -> Dict[str, str]:
    """Project name and app version the chip last printed at boot, so a report states the image that actually ran."""
    try:
        text = _ANSI_ESCAPE.sub("", Path(log_path).read_text(errors="replace"))
    except (OSError, TypeError):
        return {}
    fields = {}
    for match in _BOOT_BANNER.finditer(text):
        fields[match.group(1)] = match.group(2)
    booted = {}
    if fields.get("Project name"):
        booted["booted_project"] = fields["Project name"]
    if fields.get("App version"):
        booted["booted_app_version"] = fields["App version"]
    return booted


def normalize_serial_port(port: str) -> str:
    """
    Normalize OS serial device path for reliable read/write.

    On macOS, callers must use /dev/cu.* (call-out) rather than /dev/tty.*.
    """
    if port.startswith("/dev/tty.") and "Bluetooth" not in port:
        return f"/dev/cu.{port[len('/dev/tty.'):]}"
    return port


def decode_serial_bytes(raw: bytes) -> str:
    """Decode UART bytes and strip ESP-IDF ANSI color codes."""
    if not raw:
        return ""
    text = raw.decode("utf-8", errors="replace")
    return _ANSI_ESCAPE.sub("", text)


def reset_esp_via_uart(ser: serial.Serial) -> None:
    """
    Toggle EN via DTR/RTS so the chip reboots and prints fresh console output.

    Standard USB-UART auto-reset wiring used on ESP32-C3 devkits.
    """
    ser.setDTR(False)
    ser.setRTS(True)
    time.sleep(0.1)
    ser.setRTS(False)
    time.sleep(POST_RESET_BOOT_DELAY_SECONDS)


class _SerialCapture(threading.Thread):
    """Background reader for a single ESP serial port."""

    def __init__(self, port: str, log_path: Path, baudrate: int = BAUD_RATE, trigger_reset: bool = True):
        super().__init__(name=f"serial-{port}", daemon=True)
        self.port = normalize_serial_port(port)
        self.log_path = log_path
        self.baudrate = baudrate
        self.trigger_reset = trigger_reset
        self._stop_event = threading.Event()
        self._serial: Optional[serial.Serial] = None
        self._ready = threading.Event()
        self.lines: list[str] = []
        self._pending = ""
        self.open_error: Optional[str] = None
        self.bytes_received = 0
        self._last_recovery = 0.0
        self._in_download_mode = False
        self._recovery_attempts = 0

    def _open_port(self) -> serial.Serial:
        """Open UART for reading with the boot strap released: DTR/RTS drive GPIO9/EN on devkits, so an open that leaves them asserted can strand the chip in the ROM bootloader (the reuse path never resets, so it would stay there)."""
        uart = serial.Serial(self.port, self.baudrate, timeout=SERIAL_READ_TIMEOUT)
        try:
            uart.dtr = False
            uart.rts = False
        except (OSError, serial.SerialException) as error:
            logger.warning("Could not release DTR/RTS on %s: %s", self.port, error)
        return uart

    def _append_text(self, text: str, log_handle) -> None:
        """Write decoded UART text to memory and the log file."""
        if not text:
            return
        self.bytes_received += len(text.encode("utf-8", errors="replace"))
        log_handle.write(text)
        log_handle.flush()
        # UART bursts can end mid-line; publish only complete lines so payload parsers never see fragments.
        buffered = self._pending + text
        complete, _, self._pending = buffered.rpartition("\n")
        for line in complete.splitlines():
            clean = line.rstrip()
            if clean:
                self.lines.append(clean)
        if "waiting for download" in complete:
            self._in_download_mode = True
            self._recover_from_download_mode()
        elif self._in_download_mode and "boot:" in complete and "DOWNLOAD" not in complete:
            # An app-mode boot header means the recovery pulse worked; stop re-pulsing.
            logger.info("Chip on %s recovered from download mode after %s reset(s)", self.port, self._recovery_attempts)
            self._in_download_mode = False
            self._recovery_attempts = 0

    def _recover_from_download_mode(self) -> None:
        """A failed external esptool contact (e.g. a sibling run's discovery probe) can strand the chip in the ROM bootloader; pulse EN via the already-open handle to boot it back into the app."""
        if time.time() - self._last_recovery < DOWNLOAD_RECOVERY_INTERVAL_SECONDS:
            return
        if self._recovery_attempts >= DOWNLOAD_RECOVERY_MAX_ATTEMPTS:
            return
        self._last_recovery = time.time()
        self._recovery_attempts += 1
        uart = self._serial
        if uart is None or not uart.is_open:
            return
        logger.warning("Chip on %s entered download mode mid-capture; issuing recovery reset", self.port)
        try:
            uart.setDTR(False)
            uart.setRTS(True)
            time.sleep(0.1)
            uart.setRTS(False)
        except serial.SerialException as error:
            logger.warning("Download-mode recovery reset failed on %s: %s", self.port, error)

    def run(self) -> None:
        """Continuously read serial output into a log file."""
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        retries = 0

        while retries <= RETRY_MAX and not self._stop_event.is_set():
            try:
                self._serial = self._open_port()
                if self.trigger_reset:
                    reset_esp_via_uart(self._serial)

                self._ready.set()
                with open(self.log_path, "a", encoding="utf-8") as log_handle:
                    while not self._stop_event.is_set():
                        uart = self._serial
                        if uart is None or not uart.is_open:
                            break

                        waiting = uart.in_waiting
                        if waiting:
                            chunk = uart.read(waiting)
                            self._append_text(decode_serial_bytes(chunk), log_handle)
                            continue

                        raw = uart.readline()
                        if raw:
                            self._append_text(decode_serial_bytes(raw), log_handle)
                        else:
                            # A chip stranded in the ROM bootloader stops printing, so retry the
                            # recovery on a timer here rather than off the next (never-coming) line.
                            if self._in_download_mode:
                                self._recover_from_download_mode()
                            time.sleep(READ_POLL_SECONDS)
                if self._pending.strip():
                    self.lines.append(self._pending.strip())
                    self._pending = ""
                break
            except serial.SerialException as error:
                self.open_error = str(error)
                retries += 1
                logger.warning(
                    "Serial error on %s (retry %s/%s): %s",
                    self.port,
                    retries,
                    RETRY_MAX,
                    error,
                )
                time.sleep(1)
            finally:
                if self._serial and self._serial.is_open:
                    self._serial.close()
                    self._serial = None

        if not self._ready.is_set():
            self._ready.set()

        if retries > RETRY_MAX and not self._stop_event.is_set():
            logger.error("Serial capture on %s failed after %s retries", self.port, RETRY_MAX)
        else:
            logger.info(
                "Serial capture on %s wrote %s bytes to %s",
                self.port,
                self.bytes_received,
                self.log_path,
            )

    def wait_until_ready(self, timeout: float = 8.0) -> bool:
        """Wait until the UART is open or open attempts have failed."""
        return self._ready.wait(timeout=timeout)

    def write_line(self, command: str) -> bool:
        """
        Write a console command to the UART, submitting with a bare CR.

        The ESP-IDF console (linenoise) submits a line on CR ('\\r'); a trailing
        LF starts a fresh empty line and leaves the command unexecuted, so send
        CR only. Writing while the reader thread polls the same handle is safe —
        pyserial guards read and write independently. Returns False when the
        port is not open.
        """
        uart = self._serial
        if uart is None or not uart.is_open:
            return False
        uart.write((command + "\r").encode("utf-8"))
        uart.flush()
        return True

    def stop(self) -> None:
        """Stop capture and close the serial port."""
        self._stop_event.set()
        if self.is_alive():
            self.join(timeout=5)


class SerialLogService:
    """Start and stop UART logging — no flashing or allocation side effects."""

    def __init__(self):
        self._captures: Dict[str, _SerialCapture] = {}

    def start(
        self,
        resource: EspResource,
        log_path: Path,
        baudrate: int = BAUD_RATE,
        wait_for_port: bool = True,
        trigger_reset: bool = True,
    ) -> Path:
        """
        Start background serial logging for a resource.

        @param resource - Allocated ESP resource
        @param log_path - Destination log file path
        @param baudrate - UART baud rate (default 115200)
        @param wait_for_port - Sleep briefly so esptool can release the port
        @param trigger_reset - Reboot ESP after opening UART to capture boot + QR logs
        @returns Path to the log file
        """
        if resource.mac_address in self._captures:
            return Path(self._captures[resource.mac_address].log_path)

        if wait_for_port:
            time.sleep(PORT_RELEASE_DELAY_SECONDS)

        resource.port = normalize_serial_port(resource.port)
        log_path = Path(log_path)
        log_path.parent.mkdir(parents=True, exist_ok=True)

        capture = _SerialCapture(
            resource.port,
            log_path,
            baudrate=baudrate,
            trigger_reset=trigger_reset,
        )
        self._captures[resource.mac_address] = capture
        resource.serial_log_path = str(log_path)
        capture.start()

        if not capture.wait_until_ready(timeout=10):
            raise SerialLogError(f"Serial port {resource.port} did not open in time")
        if capture.open_error and not capture.is_alive():
            raise SerialLogError(
                f"Failed to open serial port {resource.port}: {capture.open_error}"
            )

        logger.info("Started serial logging for %s -> %s", resource.mac_address, log_path)
        return log_path

    def stop(self, resource: EspResource) -> Optional[Path]:
        """Stop serial logging and return the log path."""
        capture = self._captures.pop(resource.mac_address, None)
        if not capture:
            return Path(resource.serial_log_path) if resource.serial_log_path else None
        capture.stop()
        return capture.log_path

    def get_live_lines(self, resource: EspResource) -> list[str]:
        """Return in-memory lines for an active capture."""
        capture = self._captures.get(resource.mac_address)
        return list(capture.lines) if capture else []

    def send_command(self, resource: EspResource, command: str) -> bool:
        """Send a console command over the active UART (e.g. RainMaker CLI)."""
        capture = self._captures.get(resource.mac_address)
        if not capture:
            return False
        sent = capture.write_line(command)
        if sent:
            logger.info("Sent serial command to %s: %s", resource.mac_address, command)
        return sent

    def is_active(self, resource: EspResource) -> bool:
        """Return True when UART capture is running for the resource."""
        return resource.mac_address in self._captures

    def wait_for_bytes(self, resource: EspResource, min_bytes: int = 1, timeout: float = 15.0) -> bool:
        """Wait until the capture has received UART data or timeout expires."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            capture = self._captures.get(resource.mac_address)
            if capture and capture.bytes_received >= min_bytes:
                return True
            log_path = Path(resource.serial_log_path) if resource.serial_log_path else None
            if log_path and log_path.exists() and log_path.stat().st_size >= min_bytes:
                return True
            time.sleep(0.2)
        return False
