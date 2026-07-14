# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Thin RainMaker cloud client (nodes list, param/name/tz writes) with per-test API-call logging for report attachment."""
import json
import logging
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import requests

logger = logging.getLogger(__name__)

_log_lock = threading.Lock()
_log_path: Optional[Path] = None


def set_cloud_log_path(path) -> None:
    """Route subsequent cloud API call logs to this per-test file (None disables)."""
    global _log_path
    _log_path = Path(path) if path else None


def _log_call(method, uri, query, body, status, response_text, started, elapsed) -> None:
    if _log_path is None:
        return
    entry = {
        "ts": datetime.fromtimestamp(started).isoformat(timespec="milliseconds"),
        "elapsed_ms": round(elapsed * 1000),
        "method": method,
        "uri": uri,
        "query": query,
        "body": body,
        "status": status,
        "response": response_text,
    }
    try:
        with _log_lock:
            _log_path.parent.mkdir(parents=True, exist_ok=True)
            with open(_log_path, "a", encoding="utf-8") as handle:
                handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError as error:
        logger.warning("Cloud API log write failed: %s", error)


class RainMakerCloud:
    def __init__(self, base_uri: str, email: str, password: str):
        self.base = base_uri.rstrip("/")
        self.email = email
        self.password = password
        self._token: Optional[str] = None

    def _request(self, method: str, path: str, json_body=None, auth=True, log_body=None, log_response=True):
        url = f"{self.base}{path}"
        headers = {"Authorization": self.token()} if auth else None
        uri, _, query = url.partition("?")
        started = time.time()
        r = requests.request(method, url, headers=headers, json=json_body, verify=False, timeout=25)
        _log_call(
            method, uri, query or None,
            log_body if log_body is not None else json_body,
            r.status_code,
            r.text if log_response else "***redacted (auth tokens)***",
            started, time.time() - started,
        )
        r.raise_for_status()
        return r

    def token(self) -> str:
        if not self._token:
            r = self._request(
                "POST", "/login2",
                json_body={"user_name": self.email, "password": self.password},
                auth=False,
                log_body={"user_name": self.email, "password": "***redacted***"},
                log_response=False,
            )
            self._token = r.json().get("accesstoken")
            if not self._token:
                raise RuntimeError(f"login2 returned no accesstoken (body: {r.text[:200]})")
        return self._token

    def nodes(self) -> List[dict]:
        """List the account's nodes with id, online flag, silicon platform, display name."""
        r = self._request("GET", "/user/nodes?node_details=true")
        out = []
        for n in r.json().get("node_details", []):
            info = n.get("config", {}).get("info", {})
            params = n.get("params", {})
            name = next((p["Name"] for p in params.values() if isinstance(p, dict) and "Name" in p), None)
            tz = (params.get("Time") or {}).get("TZ")
            out.append({
                "node_id": n.get("id"),
                "online": bool(n.get("status", {}).get("connectivity", {}).get("connected")),
                "platform": (info.get("platform") or "").lower(),
                "name": name,
                "tz": tz,
                "params": params,
            })
        return out

    def set_param(self, node_id: str, payload: dict) -> None:
        self._request("PUT", "/user/nodes/params", json_body=[{"node_id": node_id, "payload": payload}])

    def remove_node(self, node_id: str) -> None:
        self._request("PUT", "/user/nodes/mapping", json_body={"node_id": node_id, "operation": "remove"})

    def remove_all_nodes(self) -> int:
        """Unmap every node from the account (clean slate for commissioning tests). Returns the count removed."""
        nodes = self.nodes()
        for node in nodes:
            try:
                self.remove_node(node["node_id"])
            except Exception as error:
                logger.warning("Could not remove node %s: %s", node["node_id"], error)
        return len(nodes)

    def remove_nodes_named(self, name: str) -> int:
        """Unmap only nodes whose device name equals `name`, leaving others (e.g. 'E2E Light' / 'Network Light') intact."""
        removed = 0
        for node in self.nodes():
            if (node.get("name") or "") == name:
                try:
                    self.remove_node(node["node_id"])
                    removed += 1
                except Exception as error:
                    logger.warning("Could not remove node %s: %s", node["node_id"], error)
        return removed

    def set_name(self, node_id: str, device_key: str, name: str) -> None:
        self.set_param(node_id, {device_key: {"Name": name}})

    def set_tz(self, node_id: str, tz: str = "Asia/Kolkata") -> None:
        self.set_param(node_id, {"Time": {"TZ": tz}})
