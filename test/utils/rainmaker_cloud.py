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

from utils.registered_user_resolver import deployment_family

logger = logging.getLogger(__name__)


def _populate_rmneo_from_s3(cfg: dict) -> None:
    """Fill empty RMNEO endpoints from the client-outputs bundle at $RMNEO_DEPLOYMENT_URL"""
    import os
    fields = ("uri", "user_api_uri", "iot_endpoint", "aws_region")
    if all(cfg.get(field) for field in fields):
        return
    url = os.getenv("RMNEO_DEPLOYMENT_URL")
    if not url:
        return
    try:
        data = requests.get(url, timeout=15).json()
    except Exception as error:
        logger.warning("RMNEO client-outputs fetch failed (%s): %s", url, error)
        return
    rmneo = data.get("rmneo-base") or {}
    espuser = data.get("espuser-base") or {}
    mapped = {
        "uri": (rmneo.get("ApiGatewayUrl") or rmneo.get("RMBaseApiEndpointFAE735B6") or "").rstrip("/"),
        "user_api_uri": (espuser.get("EspUserApiUrl") or "").rstrip("/"),
        "iot_endpoint": rmneo.get("IoTEndpointUrl"),
        "aws_region": rmneo.get("StackRegion"),
    }
    for key, value in mapped.items():
        if value and not cfg.get(key):
            cfg[key] = value

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

    def remove_nodes_except(self, keep_names) -> int:
        """Unmap every node whose name is NOT in keep_names — clears stale/unnamed Matter nodes (name=None from a config-500) that remove_nodes_named misses, while keeping reuse-online devices (E2E Light / Network Light)."""
        keep = set(keep_names)
        removed = 0
        for node in self.nodes():
            if (node.get("name") or "") not in keep:
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

    def node_groups(self) -> List[dict]:
        """The account's node groups (homes) with group_id and group_name."""
        body = self._request("GET", "/user/node_group").json()
        return body.get("groups") or body.get("group_list") or []

    def set_group_name(self, group_id: str, name: str) -> None:
        self._request("PUT", f"/user/node_group?group_id={group_id}", json_body={"group_name": name})

    def reset_home_name(self, target: str = "Home") -> None:
        """Rename the primary home group back to `target` (repeatability safety net). Filters to the primary 'home' entry — rooms and Matter sub-groups make the account list longer than one, which used to skip the rename entirely."""
        groups = self.node_groups()
        homes = [g for g in groups if g.get("primary") and (g.get("type") or "home") == "home"]
        if not homes and len(groups) == 1:
            homes = groups
        if len(homes) == 1 and homes[0].get("group_name") != target:
            self.set_group_name(homes[0]["group_id"], target)

    def add_node_to_group(self, group_id: str, node_id: str) -> None:
        self._request("PUT", f"/user/node_group?group_id={group_id}", json_body={"nodes": [node_id], "operation": "add"})

    def ensure_online_node_in_home(self, chip_type: str = "esp32c3") -> None:
        """Make sure the online E2E node is a member of the account's home group so it renders on the app home and can be shared (idempotent)."""
        node = next((n for n in self.nodes() if n.get("online") and n.get("platform") == chip_type), None)
        home = next((g for g in self.node_groups() if g.get("group_id")), None)
        if node and home:
            try:
                self.add_node_to_group(home["group_id"], node["node_id"])
            except Exception as error:
                logger.debug("ensure_online_node_in_home skipped: %s", error)

    def issued_sharing_requests(self) -> List[dict]:
        """Every sharing request this account has issued, any status — the backend keeps declined ones listed and the app renders them, so leftovers poison later scenarios."""
        body = self._request("GET", "/user/node_group/sharing/requests?primary_user=true").json()
        return body.get("sharing_requests") or []

    def remove_sharing_request(self, request_id: str) -> None:
        self._request("DELETE", f"/user/node_group/sharing/requests?request_id={request_id}")

    def issued_sharing_usernames(self) -> List[str]:
        """Usernames of pending group-sharing requests this account has issued."""
        return [r.get("user_name") for r in self.issued_sharing_requests() if r.get("user_name")]

    def shared_usernames(self) -> set:
        """Every secondary (shared-with) username on the account's groups, plus any pending issued invites. Secondary users live under group_sharing[].users.secondary as plain emails."""
        names = set(self.issued_sharing_usernames())
        try:
            body = self._request("GET", "/user/node_group/sharing").json()
            for entry in body.get("group_sharing") or []:
                for username in (entry.get("users") or {}).get("secondary") or []:
                    if username:
                        names.add(username)
        except Exception as error:
            logger.debug("shared_usernames GET failed: %s", error)
        return names

    def revoke_group_sharing(self, user_name: str) -> int:
        """Revoke `user_name`'s share of the account's groups — ONLY if actually shared. A DELETE on /sharing for an unshared user removes the node from the group (destructive), so skip when not shared."""
        if user_name not in self.shared_usernames():
            return 0
        removed = 0
        for group in self.node_groups():
            group_id = group.get("group_id")
            if not group_id:
                continue
            try:
                self._request("DELETE", f"/user/node_group/sharing?groups={group_id}&user_name={user_name}")
                removed += 1
            except Exception as error:
                logger.debug("No share to revoke for %s on group %s: %s", user_name, group_id, error)
        return removed


class RmneoCloud:
    """RMNEO (next-gen) client: plain-REST user API for auth/user ops; params are MQTT-only so param writes raise (verify via device serial)."""

    def __init__(self, cfg: dict, email: str, password: str):
        _populate_rmneo_from_s3(cfg)
        self.base = (cfg.get("uri") or "").rstrip("/")
        self.user_base = (cfg.get("user_api_uri") or "").rstrip("/")
        if not self.base or not self.user_base:
            raise ValueError("RMNEO endpoints unset — set RMNEO_DEPLOYMENT_URL to the client-outputs S3 bundle or fill uri/user_api_uri in deployment.yaml")
        self.region = cfg.get("aws_region", "ap-south-1")
        self.email = email
        self.password = password
        self.iot_endpoint = (cfg.get("iot_endpoint") or "").rstrip("/")
        self._token: Optional[str] = None
        self._id_token: Optional[str] = None
        self._creds = None
        self._creds_expiry = 0.0
        self._aws_cache = {}
        self._iot_creds = None
        self._iot_creds_expiry = 0.0

    def _request(self, method: str, path: str, json_body=None, auth=True, base=None,
                 aws_auth=None, log_body=None, log_response=True, headers=None):
        url = f"{base or self.base}{path}"
        if headers is None:
            headers = {"Authorization": self.token()} if (auth and aws_auth is None) else None
        uri, _, query = url.partition("?")
        started = time.time()
        r = requests.request(method, url, headers=headers, json=json_body, auth=aws_auth,
                             verify=False, timeout=25)
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
                "POST", "/v1/user/auth/token",
                base=self.user_base,
                json_body={"username": self.email, "password": self.password},
                auth=False,
                log_body={"username": self.email, "password": "***redacted***"},
                log_response=False,
            )
            body = r.json()
            self._token = body.get("access_token")
            self._id_token = body.get("id_token")
            if not self._token:
                raise RuntimeError(f"user/auth/token returned no access_token (body: {r.text[:200]})")
        return self._token

    def signup(self):
        """RMNEO fresh-user signup: unauthenticated POST /v1/user/auth/signup {email,password} on the user API; triggers the OTP email. Mirrors the app SDK's sendSignUpCode (the rainmaker /user2 path 403s on RMNEO)."""
        return self._request(
            "POST", "/v1/user/auth/signup", base=self.user_base, auth=False,
            json_body={"email": self.email, "password": self.password},
            log_body={"email": self.email, "password": "***redacted***"},
        )

    def confirm_signup(self, code: str):
        """RMNEO signup verify: POST /v1/user/auth/signup/verify {code,email}; confirms the account and creates the /v1/users/me profile. Mirrors the app SDK's confirmSignUp."""
        return self._request(
            "POST", "/v1/user/auth/signup/verify", base=self.user_base, auth=False,
            json_body={"code": code, "email": self.email},
        )

    def profile(self) -> dict:
        """GET /v1/users/me — current user profile (Bearer id_token, as the app SDK's getProfile sends)."""
        self.token()
        return self._request(
            "GET", "/v1/users/me", base=self.user_base, auth=False,
            headers={"Authorization": f"Bearer {self._id_token}"},
        ).json()

    def delete_user(self, user_id: str) -> None:
        self._request("DELETE", f"/v1/users/{user_id}", base=self.user_base)

    def _fetch_aws_creds(self) -> dict:
        """POST /v1/user/credentials — Bearer access token with the id token in the body, as the app SDK sends."""
        self.token()
        return self._request(
            "POST", "/v1/user/credentials",
            json_body={"id_token": self._id_token},
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self._token}"},
            log_body={"id_token": "***redacted***"},
            log_response=False,
        ).json()

    def _aws_creds(self):
        """Temporary AWS keys for SigV4 from the deployment's credentials API (cached until ~expiry)."""
        if self._creds and time.time() < self._creds_expiry:
            return self._creds
        try:
            body = self._fetch_aws_creds()
        except requests.HTTPError as error:
            # An expired session is the one retryable case; a fresh login yields new tokens.
            if getattr(error.response, "status_code", None) != 401:
                raise
            self._token = None
            self._id_token = None
            body = self._fetch_aws_creds()
        missing = [key for key in ("access_key_id", "secret_access_key", "session_token") if not body.get(key)]
        if missing:
            raise RuntimeError(f"/v1/user/credentials response is missing {missing} (keys: {sorted(body)})")
        self._creds = {
            "AccessKeyId": body["access_key_id"],
            "SecretKey": body["secret_access_key"],
            "SessionToken": body["session_token"],
        }
        self._creds_expiry = float(body.get("expiration") or (time.time() + 3600)) - 60
        self._aws_cache = {}
        return self._creds

    def _aws_auth(self, service: str = "execute-api"):
        """SigV4 signer for `service` from the cached identity-pool creds (execute-api = groups/nodes REST; iotdevicegateway = IoT MQTT-over-WebSocket presign)."""
        from requests_aws4auth import AWS4Auth
        creds = self._aws_creds()
        if service not in self._aws_cache:
            self._aws_cache[service] = AWS4Auth(
                creds["AccessKeyId"], creds["SecretKey"], self.region, service,
                session_token=creds["SessionToken"])
        return self._aws_cache[service]

    def _signed(self, method: str, path: str, json_body=None):
        return self._request(method, path, json_body=json_body, aws_auth=self._aws_auth())

    def _assume_role_creds(self):
        """POST /v1/assumed-roles (identity-pool-signed) for a separate credential set carrying IoT/MQTT permissions, mirroring the app SDK's assumeRole; cached until ~expiry."""
        if self._iot_creds and time.time() < self._iot_creds_expiry:
            return self._iot_creds
        ic = self._aws_creds()
        r = self._request("POST", "/v1/assumed-roles",
                          json_body={"access_key": ic["AccessKeyId"], "secret_key": ic["SecretKey"],
                                     "session_token": ic["SessionToken"]},
                          aws_auth=self._aws_auth("execute-api"),
                          log_body={"access_key": "***", "secret_key": "***", "session_token": "***"},
                          log_response=False)
        body = r.json()
        self._iot_creds = {"ak": body["access_key"], "sk": body["secret_key"], "tok": body["session_token"]}
        self._iot_creds_expiry = time.time() + 900 - 60
        return self._iot_creds

    def _iot_wss_path(self, creds) -> str:
        """SigV4-presigned `/mqtt?...` query for an AWS IoT WebSocket (service iotdevicegateway)."""
        import hashlib
        import hmac
        import urllib.parse
        amz = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
        ds = amz[:8]
        scope = f"{ds}/{self.region}/iotdevicegateway/aws4_request"
        q = {"X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": f"{creds['ak']}/{scope}",
             "X-Amz-Date": amz, "X-Amz-SignedHeaders": "host"}
        cqs = "&".join(f"{k}={urllib.parse.quote(q[k], safe='')}" for k in sorted(q))
        creq = f"GET\n/mqtt\n{cqs}\nhost:{self.iot_endpoint}\n\nhost\n" + hashlib.sha256(b"").hexdigest()
        sts = f"AWS4-HMAC-SHA256\n{amz}\n{scope}\n" + hashlib.sha256(creq.encode()).hexdigest()
        _h = lambda k, m: hmac.new(k, m.encode(), hashlib.sha256).digest()
        key = _h(_h(_h(_h(("AWS4" + creds['sk']).encode(), ds), self.region), "iotdevicegateway"), "aws4_request")
        sig = hmac.new(key, sts.encode(), hashlib.sha256).hexdigest()
        cqs += f"&X-Amz-Signature={sig}&X-Amz-Security-Token={urllib.parse.quote(creds['tok'], safe='')}"
        return "/mqtt?" + cqs

    def _node_shadow(self, node_id: str, group_id: str, timeout: int = 12) -> dict:
        """Read the node's shadow `params-<group_id>` over MQTT and return its `state.reported` dict."""
        if not self.iot_endpoint:
            return {}
        try:
            import paho.mqtt.client as mqtt
        except ImportError:
            logger.warning("paho-mqtt not installed; cannot read RMNEO node shadow over MQTT")
            return {}
        import random
        try:
            creds = self._assume_role_creds()
        except Exception as error:
            logger.warning("RMNEO assume-role failed (%s); cannot read node shadow", error)
            return {}
        topic = f"$aws/things/{node_id}/shadow/name/params-{group_id}"
        state = {}

        def on_connect(client, userdata, flags, rc, props=None):
            client.subscribe(topic + "/get/accepted")
            client.subscribe(topic + "/get/rejected")
            client.publish(topic + "/get", "")

        def on_message(client, userdata, msg):
            try:
                doc = json.loads(msg.payload.decode())
            except (ValueError, UnicodeDecodeError):
                doc = {}
            if msg.topic.endswith("/get/accepted"):
                state["reported"] = (doc.get("state") or {}).get("reported") or {}
            state["done"] = True
            client.disconnect()

        cid = f"user:{self.email}:{random.randint(0, 999999):06d}"
        try:
            client = mqtt.Client(client_id=cid, transport="websockets",
                                 callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
        except (AttributeError, TypeError):
            client = mqtt.Client(client_id=cid, transport="websockets")
        client.tls_set()
        client.ws_set_options(path=self._iot_wss_path(creds))
        client.on_connect = on_connect
        client.on_message = on_message
        try:
            client.connect(self.iot_endpoint, 443, keepalive=30)
        except OSError as error:
            logger.warning("RMNEO IoT MQTT connect failed for %s: %s", node_id, error)
            return {}
        client.loop_start()
        deadline = time.time() + timeout
        while time.time() < deadline and not state.get("done"):
            time.sleep(0.3)
        client.loop_stop()
        try:
            client.disconnect()
        except Exception:
            pass
        return state.get("reported") or {}

    def groups(self) -> List[dict]:
        body = self._signed("GET", "/v1/groups").json()
        if isinstance(body, list):
            return body
        return body.get("groups") or body.get("group_list") or []

    def create_group(self, name: str = "Home") -> str:
        """SigV4-signed POST /v1/groups creating a root node group. Returns the new group_id."""
        body = self._signed("POST", "/v1/groups", json_body={"group_name": name}).json()
        group_id = body.get("group_id")
        if not group_id:
            raise RuntimeError(f"create_group: no group_id in response (body: {body})")
        logger.info("Created RMNEO group '%s' (group_id=%s)", name, group_id)
        return group_id

    def create_home(self, name: str = "Home") -> str:
        """A home on RMNEO is just a root node group; create one so a brand-new account (whose empty /v1/groups 500s) can reach the home screen."""
        return self.create_group(name)

    def nodes(self) -> List[dict]:
        """Same shape as RainMakerCloud.nodes() plus group_id + capabilities, sourced from the /v1/groups node list."""
        out = []
        for group in self.groups():
            gid = group.get("group_id")
            if not gid:
                continue
            details = group.get("node_details") or {}
            for nid in group.get("node_ids") or []:
                caps = (details.get(nid) or {}).get("capabilities") or []
                matter_only = "matter" in caps and not any(c in ("rmneo", ) for c in caps)
                reported = {} if matter_only else self._node_shadow(nid, gid)
                params = reported.get("params") or {}
                entry = {
                    "node_id": nid, "group_id": gid,
                    "capabilities": caps,
                    "online": reported.get("online"),
                    "params": params,
                    # user-set device name lives in the shadow (params.<device>.Name), as on rainmaker
                    "name": next((p["Name"] for p in params.values()
                                  if isinstance(p, dict) and "Name" in p), None),
                    "tz": (params.get("Time") or {}).get("TZ"),
                    "platform": "",
                }
                if not matter_only:
                    try:
                        cfg = self._signed("GET", f"/v1/groups/{gid}/nodes/{nid}/config").json()
                        entry["platform"] = ((cfg or {}).get("info", {}).get("platform") or "").lower()
                        if not entry["name"]:
                            devices = (cfg or {}).get("devices") or []
                            if devices and isinstance(devices[0], dict):
                                entry["name"] = devices[0].get("name") or devices[0].get("id")
                    except Exception as error:
                        logger.warning("RMNEO node config read failed for %s/%s: %s", gid, nid, error)
                out.append(entry)
        return out

    def set_group_name(self, group_id: str, name: str) -> None:
        self._signed("PATCH", f"/v1/groups/{group_id}", json_body={"group_name": name})

    def reset_home_name(self, target: str = "Home") -> None:
        """Rename the primary home group back to `target` (repeatability safety net). Filters to the primary 'home' entry — sub-groups make the account list longer than one, which used to skip the rename entirely."""
        groups = self.groups()
        homes = [g for g in groups if g.get("primary") and (g.get("type") or "home") == "home"]
        if not homes and len(groups) == 1:
            homes = groups
        if len(homes) == 1 and homes[0].get("group_name") != target:
            self.set_group_name(homes[0]["group_id"], target)

    def group_users(self, group_id: str) -> List[dict]:
        body = self._signed("GET", f"/v1/groups/{group_id}/users").json()
        return body.get("users") or []

    def shared_usernames(self) -> set:
        """Every email that currently holds secondary access on the account's groups."""
        names = set()
        for group in self.groups():
            group_id = group.get("group_id")
            if not group_id:
                continue
            try:
                for user in self.group_users(group_id):
                    if user.get("access_type") != "primary" and user.get("email"):
                        names.add(user["email"])
            except Exception as error:
                logger.debug("group_users failed for %s: %s", group_id, error)
        return names

    def revoke_group_sharing(self, user_name: str) -> int:
        """Remove `user_name`'s secondary membership from the account's groups (targeted DELETE per member, safe by construction)."""
        removed = 0
        for group in self.groups():
            group_id = group.get("group_id")
            if not group_id:
                continue
            try:
                member = next((u for u in self.group_users(group_id)
                               if u.get("email") == user_name and u.get("access_type") != "primary"), None)
                if member and member.get("user_id"):
                    self._signed("DELETE", f"/v1/groups/{group_id}/users/{member['user_id']}")
                    removed += 1
            except Exception as error:
                logger.debug("No share to revoke for %s on group %s: %s", user_name, group_id, error)
        return removed

    def ensure_online_node_in_home(self, chip_type: str = "esp32c3") -> None:
        """Parity no-op with RainMakerCloud: RMNEO nodes join their group at provisioning, so there is no out-of-group state to repair."""
        return None

    def remove_node(self, node_id: str, group_id: str = None) -> None:
        if group_id is None:
            group_id = next((n["group_id"] for n in self.nodes() if n["node_id"] == node_id), None)
            if group_id is None:
                raise RuntimeError(f"RMNEO node {node_id} not found in any group")
        self._signed("DELETE", f"/v1/groups/{group_id}/nodes/{node_id}")

    def remove_all_nodes(self) -> int:
        nodes = self.nodes()
        for node in nodes:
            try:
                self.remove_node(node["node_id"], node["group_id"])
            except Exception as error:
                logger.warning("Could not remove RMNEO node %s: %s", node["node_id"], error)
        return len(nodes)

    def remove_nodes_named(self, name: str) -> int:
        removed = 0
        for node in self.nodes():
            if (node.get("name") or "") == name:
                try:
                    self.remove_node(node["node_id"], node["group_id"])
                    removed += 1
                except Exception as error:
                    logger.warning("Could not remove RMNEO node %s: %s", node["node_id"], error)
        return removed

    def remove_nodes_except(self, keep_names) -> int:
        """Unmap every node whose name is NOT in keep_names — clears stale/unnamed Matter nodes (name=None from a config-500) that remove_nodes_named misses, keeping reuse-online devices (E2E Light / Network Light)."""
        keep = set(keep_names)
        removed = 0
        for node in self.nodes():
            if (node.get("name") or "") not in keep:
                try:
                    self.remove_node(node["node_id"], node.get("group_id"))
                    removed += 1
                except Exception as error:
                    logger.warning("Could not remove RMNEO node %s: %s", node["node_id"], error)
        return removed

    def group_id_for_node(self, node_id: str) -> str:
        """Group that owns the node; the schedules endpoint is group-scoped."""
        for node in self.nodes():
            if node.get("node_id") == node_id and node.get("group_id"):
                return node["group_id"]
        raise RuntimeError(f"No RMNEO group found for node {node_id}")

    def set_schedules(self, node_id: str, schedules: List[dict], group_id: str = None) -> None:
        """Replace the node's schedule list (PUT is replace-all); unlike params this is a REST endpoint on RMNEO."""
        group_id = group_id or self.group_id_for_node(node_id)
        self._signed("PUT", f"/v1/groups/{group_id}/nodes/{node_id}/schedules",
                     json_body={"schedules": schedules})

    def _mqtt_only(self, operation: str):
        raise NotImplementedError(
            f"RmneoCloud.{operation}: node params are MQTT-only on RMNEO — verify via the device serial")

    def set_param(self, node_id: str, payload: dict) -> None:
        self._mqtt_only("set_param")

    def set_name(self, node_id: str, device_key: str, name: str) -> None:
        self._mqtt_only("set_name")

    def set_tz(self, node_id: str, tz: str = "Asia/Kolkata") -> None:
        self._mqtt_only("set_tz")


def is_rmneo_deployment(deployment_cfg: dict) -> bool:
    """RMNEO deployments are marked `type: neo` in deployment.yaml (RM blocks carry `type: classic`)."""
    return deployment_family(str(deployment_cfg.get("type") or "")) == "rmneo"


def cloud_for(deployment_cfg: dict, email: str, password: str):
    """Deployment-aware client factory: RmneoCloud for `type: rmneo` blocks, else RainMakerCloud."""
    if is_rmneo_deployment(deployment_cfg):
        return RmneoCloud(deployment_cfg, email, password)
    return RainMakerCloud(deployment_cfg["uri"], email, password)


def create_and_confirm_rmneo_user(cfg: dict, password: str) -> dict:
    """RMNEO fresh-user creation via the espuser API (signup -> Mailosaur OTP -> verify), mirroring the app SDK. Used instead of ApiUserHelper on RMNEO, whose /user2 signup 403s. Returns {email, password}."""
    from utils.mailosaur_helper import generate_email, get_verification_code
    email = generate_email()
    cloud = RmneoCloud(cfg, email, password)
    cloud.signup()
    code = get_verification_code(email)
    cloud.confirm_signup(code)
    return {"email": email, "password": password}
