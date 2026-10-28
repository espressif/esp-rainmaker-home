# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""DeviceSerial: drive a param on the rig device via the RainMaker console and verify it from the device's UART log (firmware prints `app_main: Received value = <val> for <device> - <param>` on every applied write)."""
import json
import logging
import re
import time

logger = logging.getLogger(__name__)


def _fmt(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


class DeviceSerial:
    def __init__(self, resource_manager, resource, device_name="Light"):
        self._rm = resource_manager
        self._resource = resource
        self.device_name = device_name

    def _log_text(self):
        """The full on-disk serial log, or None when it cannot be read."""
        path = getattr(self._resource, "serial_log_path", None)
        if path:
            try:
                with open(path, "r", errors="replace") as fh:
                    return fh.read()
            except Exception:
                pass
        return None

    def lines(self):
        """Return all captured serial lines (full on-disk log; falls back to the bounded live buffer)."""
        text = self._log_text()
        if text is not None:
            return text.splitlines()
        try:
            return list(self._rm.serial_logger.get_live_lines(self._resource))
        except Exception:
            return []

    def marker(self):
        """Return an index into the log scoping later waits to new output; a last line still missing its newline (the console '>> ' prompt) stays in scope, because the next log line is appended onto it."""
        text = self._log_text()
        if text is None:
            return len(self.lines())
        count = len(text.splitlines())
        return count - 1 if count and not text.endswith(("\n", "\r")) else count

    def set_param(self, param, value):
        """Inject a param write on the device (also reported to cloud).

        Fails at once when the firmware has no `set-param` command, instead of a
        later check failing because the device never changed.
        """
        cmd = f"set-param {self.device_name} {param} {_fmt(value)}"
        logger.info("Serial: %s", cmd)
        since = self.marker()
        self._rm.serial_logger.send_command(self._resource, cmd)
        time.sleep(2)
        # Classic and Neo firmware both confirm with "Successfully set <device>.<param> to ...";
        # Neo prints nothing at all when the command is not built in.
        confirm = f"Successfully set {self.device_name}.{param}"
        deadline = time.time() + 3
        reply = [line.strip() for line in self.lines()[since:] if line.strip()]
        while not any(confirm in line for line in reply) and time.time() < deadline:
            time.sleep(0.5)
            reply = [line.strip() for line in self.lines()[since:] if line.strip()]
        # Shown in the CI log so a command the board ignores is visible; secrets left out.
        shown = [line[:160] for line in reply[-6:] if not re.search(r"(?i)pass|pwd|ssid|secret|token", line)]
        logger.info("Device reply to '%s': %s", cmd, " | ".join(shown) or "(nothing)")
        if not any(confirm in line for line in reply):
            raise AssertionError(
                f"Device did not confirm '{cmd}'; its firmware may lack the set-param console "
                "command (Neo builds need CONFIG_ESP_RMAKER_NEO_CONSOLE_PARAM_CMDS_ENABLE=y)"
            )
        return self

    def wait_for_param(self, param, value, timeout=30, since=0, tol=2):
        """True when the device logs <param> applied with <value> (numeric within ±tol for slider input)."""
        suffix = f" for {self.device_name} - {param}"
        if isinstance(value, bool) or not isinstance(value, int):
            candidates = [_fmt(value)]
        else:
            candidates = [_fmt(v) for v in range(value - tol, value + tol + 1)]
        needles = []
        for c in candidates:
            needles.append(f"Received value = {c}{suffix}")
            needles.append(f"{param} changed to {c}")
            needles.append(f"for {param} -> {c}")
        deadline = time.time() + timeout
        while time.time() < deadline:
            buf = self.lines()
            for line in buf[since:]:
                if any(needle in line for needle in needles):
                    logger.info("Serial confirmed:%s = %s", suffix, _fmt(value))
                    return True
            time.sleep(1)
        logger.warning("Serial did not confirm: Received value = %s%s", _fmt(value), suffix)
        return False

    def wait_for_name_write(self, name, since=0, timeout=20):
        """True when the device logs a received cloud/local write of Name=<name> after log index `since`."""
        needle = f'"Name":"{name}"'
        deadline = time.time() + timeout
        while time.time() < deadline:
            if any("Received params" in line and needle in line for line in self.lines()[since:]):
                return True
            time.sleep(1)
        return False

    def reported_params(self):
        """Parse the device's latest reported param values from the serial log.

        Firmware prints `Reporting params ...: {"Light":{"Power":true,"Brightness":25,
        "Hue":180,"Saturation":100}}`; the latest value seen per key wins. Used as the
        baseline snapshot and to confirm an "unchanged" param stayed put.
        Returns {param: value}.
        """
        params = {}
        for line in self.lines():
            m = re.search(r"Reporting params[^{]*(\{.*\})", line)
            if not m:
                continue
            try:
                data = json.loads(m.group(1))
            except Exception:
                continue
            for section in data.values():
                if isinstance(section, dict):
                    params.update(section)
        return params

    def param_written_since(self, param, since=0):
        """True if the device logged a write for <param> after log index `since`
        (used to assert an "unchanged" param was NOT modified by the action)."""
        suffix = f" for {self.device_name} - {param}"
        for line in self.lines()[since:]:
            if (("Received value = " in line and suffix in line)
                    or f"{param} changed to " in line
                    or f"for {param} -> " in line):
                return True
        return False
