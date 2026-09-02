# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Expected UI copy straight from the app's own sources of truth.

The 6.1.0 toasts render `res.description || t(<i18n key>)`, so the expected
string is either the backend's response text (captured live from the same
endpoint the shipped SDK calls) or the app's locale entry — never a literal
maintained in the test tree.
"""
import json
import logging
import urllib.request
from functools import lru_cache
from pathlib import Path

from utils.registered_user_resolver import deployment_type, load_deployment_config

logger = logging.getLogger(__name__)

_TEST_ROOT = Path(__file__).resolve().parents[1]


@lru_cache(maxsize=1)
def _locale_strings() -> dict:
    """The app's en.json: the repo checkout's copy first, else one synced next to the test tree."""
    for candidate in (_TEST_ROOT.parent / "locales" / "en.json",
                      _TEST_ROOT / "locales" / "en.json"):
        if candidate.exists():
            return json.loads(candidate.read_text(encoding="utf-8"))
    raise FileNotFoundError("locales/en.json not found beside or above the test tree")


def app_i18n(key: str) -> str:
    """Dot-path lookup into the app's locale file, e.g. app_i18n('auth.verification.heading')."""
    node = _locale_strings()
    for part in key.split("."):
        node = node[part]
    return node


# Backend copies that differ between the classic (rm) and neo deployments; feature
# files carry the token and the step resolves it for the deployment under test.
SERVER_COPY = {
    "signup password policy error": {
        "rm": "Password length must be between 8 to 256 characters. It should be alpha-numeric without any whitespace. It should contain atleast one uppercase, one lowercase character and a number",
        "rmneo": "Password must be at least 8 characters and include one uppercase letter and one special character.",
    },
    "change password policy error": {
        "rm": "Password length must be between 8 to 256 characters. It should be alpha-numeric without any whitespace. It should contain atleast one uppercase, one lowercase character and a number",
        "rmneo": "Password change failed",
    },
    "incorrect verification code": {
        "rm": "Verification code is incorrect",
        "rmneo": "Invalid verification code",
    },
    "incorrect current password": {
        "rm": "The password you entered is incorrect",
        "rmneo": "Password change failed",
    },
    "wrong credentials": {
        "rm": "Incorrect user name or password",
        "rmneo": "Authentication failed",
    },
    "signup whitespace password error": {
        "rm": "Password length must be between 8 to 256 characters. It should be alpha-numeric without any whitespace. It should contain atleast one uppercase, one lowercase character and a number",
        "rmneo": "Failed to create user account",
    },
}


def resolve_server_copy(deployment: str, text: str) -> str:
    """Map a SERVER_COPY token to the deployment's backend copy; literals pass through."""
    entry = SERVER_COPY.get(text)
    if not entry:
        return text
    return entry[deployment_type(deployment)]


def request_password_recovery_copy(deployment: str, email: str) -> "str | None":
    """The backend's own text for the forgot-password toast, from the same endpoint the app's SDK calls (classic: POST /v1/forgotpassword2; neo: POST /v1/user/auth/password-recovery). None if the call fails or returns no text — the caller falls back to the i18n heading, mirroring the app."""
    block = load_deployment_config(deployment).get(deployment, {}) or {}
    if deployment_type(deployment) == "rmneo":
        base = (block.get("user_api_uri") or "").rstrip("/")
        url, body, method = f"{base}/v1/user/auth/password-recovery", {"username": email}, "POST"
    else:
        base = (block.get("uri") or "").rstrip("/")
        url, body, method = f"{base}/forgotpassword2", {"user_name": email}, "PUT"
    if not base:
        logger.warning("No API base for %s in deployment.yaml; falling back to i18n", deployment)
        return None
    request = urllib.request.Request(
        url, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "User-Agent": "esp-e2e/1.0"}, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read() or b"{}")
    except Exception as error:
        logger.warning("password-recovery copy probe failed (%s); falling back to i18n", error)
        return None
    return payload.get("description") or payload.get("message")
