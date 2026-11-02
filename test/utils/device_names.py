# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Run-unique device names: a feature-level name ('E2E Light') maps to the name this run gives the device ('E2E Light A210128' = Android run started 21:01:28, the time that prefixes the report run id)."""
import re
import time

_registry = {}
_token = None


def bind_run(platform, run_id=None, unique=True):
    """Fix this run's suffix once: platform letter (A/I) + the run's HHMMSS start time taken from the report run id; unique=False keeps plain names (RainMaker Neo, where the test cloud cannot write a node name, so a run-unique name would force an in-app rename every run)."""
    global _token
    if _token is None:
        started = (run_id or "")[:6]
        if not re.fullmatch(r"\d{6}", started):
            started = time.strftime("%H%M%S")
        _token = f"{(platform or 'x')[0].upper()}{started}" if unique else ""
    return _token


def unique_device_name(name):
    """The run-unique name for `name`, registered on first use; already-unique names, and every name in a plain-name run, pass through."""
    token = bind_run(None)
    if not token:
        return name
    if name in _registry:
        return _registry[name]
    if name in _registry.values() or (name or "").endswith(f" {token}"):
        return name
    _registry[name] = f"{name} {token}"
    return _registry[name]


def resolve_device_name(name):
    """The on-screen name of a device this run named; names it never registered are returned unchanged."""
    return _registry.get(name, name)


def is_variant_of(actual, name):
    """Whether `actual` is `name` itself or any run's unique variant of it ('E2E Light I210131')."""
    return actual == name or bool(re.fullmatch(re.escape(name) + r" [A-Z]\d{6}", actual or ""))
