# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

import fcntl
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

import yaml


def _deployment_config_path() -> Path:
    return Path(__file__).resolve().parents[1] / "config" / "deployment.yaml"


@contextmanager
def _deployment_lock():
    """
    Cross-process exclusive lock around deployment.yaml read-modify-write.

    Parallel Android+iOS pytest processes both create/update registered users;
    fcntl.flock serializes the brief write windows so neither loses the other's
    update or reads a half-written file.
    """
    lock_path = _deployment_config_path().with_name("deployment.yaml.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with open(lock_path, "w") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def _atomic_write_config(config: Dict) -> None:
    """Write deployment.yaml via a temp file + os.replace (no torn reads)."""
    path = _deployment_config_path()
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as handle:
            yaml.safe_dump(config, handle, default_flow_style=False)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def _resolve_deployment(deployment: Optional[str]) -> str:
    return (
        deployment
        or os.getenv("ESP_DEPLOYMENT")
        or os.getenv("PYTEST_DEPLOYMENT")
        or os.getenv("DEPLOYMENT")
        or "rm"
    )


def mutate_registered_users(
    deployment: str,
    model: Optional[str],
    mutate: Callable[[List[Dict[str, str]]], List[Dict[str, str]]],
) -> List[Dict[str, str]]:
    """
    Atomically update one model's registered_users under the cross-process lock.

    registered_users is a mapping of device model -> [users] so parallel
    Android/iOS runs use separate credential pools and never collide. Loads the
    freshest config inside the lock, applies `mutate` to the model's list, and
    writes atomically.
    """
    with _deployment_lock():
        config = load_deployment_config(deployment)
        env_config = config.setdefault(deployment, {})
        registered = env_config.get("registered_users")
        if not isinstance(registered, dict):
            registered = {}  # migrate legacy flat list to per-model mapping
        users = mutate(list(registered.get(model, []) if model else []))
        registered[model] = users
        env_config["registered_users"] = registered
        _atomic_write_config(config)
        return users


def load_deployment_config(deployment: str) -> Dict:
    config_path = _deployment_config_path()
    if not config_path.exists():
        raise FileNotFoundError(f"{config_path} not found")
    with open(config_path, "r") as f:
        config = yaml.safe_load(f) or {}
    if deployment not in config:
        raise KeyError(f"Deployment '{deployment}' not found in {config_path}")
    return config


RMNEO_TYPE_ALIASES = ("neo", "rmneo")

def deployment_family(declared: str) -> str:
    """rm|rmneo family for a `type` value or deployment name; the family names persisted rig state (cert-store dirs, firmware matching), so config vocabulary funnels through here only."""
    return "rmneo" if (declared or "").strip().lower() in RMNEO_TYPE_ALIASES else "rm"


def deployment_type(deployment: str) -> str:
    """Firmware/SDK family for a deployment: the block's `type` (classic|neo) when present, else the name itself. Adding a new deployment only needs a `type:` in deployment.yaml."""
    try:
        block = load_deployment_config(deployment).get(deployment, {}) or {}
        declared = str(block.get("type") or "")
        if declared.strip():
            return deployment_family(declared)
    except Exception:
        pass
    return deployment_family(deployment)


def load_registered_users(
    config: Dict, deployment: str, model: Optional[str] = None
) -> List[Dict[str, str]]:
    """
    Return the registered users for a model.

    registered_users is keyed by device model; a legacy flat list (no model
    keys) is returned as-is so older configs keep working.
    """
    registered = config.get(deployment, {}).get("registered_users", []) or []
    if isinstance(registered, dict):
        if model is not None:
            return registered.get(model, []) or []
        # No model (callers like forgot-password resolve an email without one):
        # flatten every bucket so the lookup still finds existing accounts.
        return [user for bucket in registered.values() for user in (bucket or [])]
    return registered  # legacy shared list


def _indexed_user(user_token: str, users: List[Dict[str, str]], offset: int):
    """Return the 1-based 'registered user N' entry, or None when out of range."""
    parts = user_token.split()
    index = int(parts[offset]) if len(parts) > 2 and parts[offset].lstrip("-").isdigit() else 1
    index = max(1, index)
    return users[index - 1] if len(users) >= index else None


def resolve_registered_user_email(
    user_token: str, deployment: Optional[str] = None, model: Optional[str] = None
) -> str:
    if not user_token.startswith("registered user"):
        return user_token
    deployment = _resolve_deployment(deployment)
    config = load_deployment_config(deployment)
    users = load_registered_users(config, deployment, model)
    user = _indexed_user(user_token, users, offset=-1)
    if user is None:
        raise IndexError(
            f"Registered user '{user_token}' not found for {deployment}/{model}"
        )
    return user["email"]


def resolve_registered_user_password(
    user_token: str, deployment: Optional[str] = None, model: Optional[str] = None
) -> str:
    if not user_token.startswith("registered user"):
        return user_token
    deployment = _resolve_deployment(deployment)
    config = load_deployment_config(deployment)
    default_password = config.get(deployment, {}).get("password", "Welcome01")
    parts = user_token.split()
    if parts[-1] != "password":
        return user_token
    users = load_registered_users(config, deployment, model)
    user = _indexed_user(user_token, users, offset=-2)
    if user is None:
        return default_password
    return user.get("password") or default_password


def update_registered_user_password(
    email: str,
    new_password: str,
    deployment: Optional[str] = None,
    model: Optional[str] = None,
) -> Tuple[bool, str]:
    deployment = _resolve_deployment(deployment)
    found = {"hit": False}

    def _set_password(users: List[Dict[str, str]]) -> List[Dict[str, str]]:
        for user in users:
            if user.get("email") == email:
                user["password"] = new_password
                found["hit"] = True
        return users

    if model is not None:
        mutate_registered_users(deployment, model, _set_password)
    else:
        # No model: the account may live in any model's bucket, so update it
        # wherever the email is found (callers here pass a concrete email).
        with _deployment_lock():
            config = load_deployment_config(deployment)
            registered = config.setdefault(deployment, {}).get("registered_users", []) or []
            if isinstance(registered, dict):
                for key in list(registered):
                    registered[key] = _set_password(registered[key] or [])
                config[deployment]["registered_users"] = registered
            else:
                config[deployment]["registered_users"] = _set_password(list(registered))
            _atomic_write_config(config)
    if found["hit"]:
        print(f"Updated registered user password for email: {email}")
        return True, deployment
    print(f"Failed to update registered user password for email: {email}")
    return False, deployment
