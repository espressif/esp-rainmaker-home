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

    def lines(self):
        """Return all captured serial lines (full on-disk log; falls back to the bounded live buffer)."""
        path = getattr(self._resource, "serial_log_path", None)
        if path:
            try:
                with open(path, "r", errors="replace") as fh:
                    return fh.read().splitlines()
            except Exception:
                pass
        try:
            return list(self._rm.serial_logger.get_live_lines(self._resource))
        except Exception:
            return []

    def marker(self):
        """Return an index into the live buffer to scope later waits to new output."""
        return len(self.lines())

    def set_param(self, param, value):
        """Inject a param write on the device (also reported to cloud)."""
        cmd = f"set-param {self.device_name} {param} {_fmt(value)}"
        logger.info("Serial: %s", cmd)
        self._rm.serial_logger.send_command(self._resource, cmd)
        time.sleep(2)
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
