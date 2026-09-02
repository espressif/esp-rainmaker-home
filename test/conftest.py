# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Main conftest.py with Appium 2 standalone server support."""
import pytest
from pytest_bdd import when, given, then, parsers
import yaml
import sys
import logging
import atexit
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Optional
# Logging is captured by pytest itself; no root StreamHandler here (would duplicate every log line).
logger = logging.getLogger(__name__)
e2e_log = logging.getLogger("e2e")

# Appium imports
from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.options.ios import XCUITestOptions

# Add utils to path
IMPORT_PATH = Path(".").absolute()
sys.path.append(str(IMPORT_PATH))

from utils.grid_manager import AppiumGridManager
from utils.page_helpers.base import PageHelperManager
from utils.debug_helper import DebugHelper
from utils.device_detector import MobileDeviceDetector
from utils.api_user_helper import ApiUserHelper
from utils.registered_user_resolver import (
    deployment_type,
    load_deployment_config,
    load_registered_users,
    mutate_registered_users,
    resolve_registered_user_password,
)

try:
    from utils.pytest_report_plugin import PytestReportPlugin
    REPORT_PLUGIN_AVAILABLE = True
except ImportError:
    REPORT_PLUGIN_AVAILABLE = False
    logger.debug("Report plugin not available")


# Disable verbose logging for various components
logging.getLogger('pytest_html').setLevel(logging.ERROR)
logging.getLogger('py.warnings').setLevel(logging.ERROR)
logging.getLogger('urllib3').setLevel(logging.ERROR)
logging.getLogger('selenium').setLevel(logging.ERROR)
logging.getLogger('appium').setLevel(logging.ERROR)
logging.getLogger('utils.debug_helper').setLevel(logging.ERROR)
logging.getLogger('utils.grid_manager').setLevel(logging.ERROR)

# Only show critical errors and test results
logging.getLogger('conftest').setLevel(logging.ERROR)
logging.getLogger('test_login').setLevel(logging.ERROR)
logging.getLogger('test_signup').setLevel(logging.ERROR)

# Global instances
grid_manager: Optional[AppiumGridManager] = None
debug_helper: Optional[DebugHelper] = None


def _repo_root() -> Path:
    return Path(__file__).resolve().parent


def _deployment_config_path() -> Path:
    return _repo_root() / "config" / "deployment.yaml"


def _load_deployment_config(deployment: str) -> dict:
    config = load_deployment_config(deployment)
    logger.info("Loaded deployment config for '%s' from %s", deployment, _deployment_config_path())
    return config


def _ensure_rmneo_home(env_config: dict, email: str, password: str) -> None:
    """RMNEO-only: a brand-new account has no home (root node group), so GET /v1/groups 500s and the app
    can't reach the home screen. Log in via the SigV4 cloud client and create one so the fresh account is
    test-ready. No-op for `type: rm` deployments."""
    from utils.rainmaker_cloud import cloud_for, is_rmneo_deployment
    if not is_rmneo_deployment(env_config):
        return
    try:
        group_id = cloud_for(env_config, email, password).create_home()
        logger.info("RMNEO: created home (group_id=%s) for fresh user %s", group_id, email)
    except Exception as error:
        logger.error("RMNEO: failed to create home for fresh user %s: %s", email, error)
        raise


@pytest.fixture(scope="session")
def api_user_factory(pytestconfig):
    deployment = pytestconfig.getoption("--deployment")
    model = pytestconfig.getoption("--model", default=None)
    config = _load_deployment_config(deployment)
    env_config = config.get(deployment, {})
    base_uri = env_config.get("uri")
    password = env_config.get("password", "Welcome01")
    if not base_uri:
        raise ValueError(f"Missing 'uri' for deployment '{deployment}' in config/deployment.yaml")
    helper = ApiUserHelper(base_uri)
    users = load_registered_users(config, deployment, model)
    logger.info("Loaded %s registered users for %s/%s", len(users), deployment, model)

    from utils.rainmaker_cloud import is_rmneo_deployment
    is_rmneo = is_rmneo_deployment(env_config)

    def create_users(count: int = 1, user_password: Optional[str] = None):
        nonlocal users
        pw = user_password or password
        logger.info("Creating %s registered user(s) via API for %s/%s", count, deployment, model)
        created = []
        for _ in range(count):
            if is_rmneo:
                from utils.rainmaker_cloud import create_and_confirm_rmneo_user
                user = create_and_confirm_rmneo_user(env_config, pw)
            else:
                user = helper.create_and_confirm_user(pw)
            _ensure_rmneo_home(env_config, user["email"], pw)
            created.append(user)
        users = mutate_registered_users(deployment, model, lambda existing: existing + created)
        logger.info("Saved %s registered users for %s/%s", len(users), deployment, model)
        return users if count > 1 else users[-1]

    return create_users


@pytest.fixture(scope="session")
def registered_user_resolver(pytestconfig, api_user_factory):
    def resolve(user_token: str, password: Optional[str] = None) -> str:
        deployment = pytestconfig.getoption("--deployment")
        model = pytestconfig.getoption("--model", default=None)
        config = _load_deployment_config(deployment)
        if user_token.startswith("registered user"):
            parts = user_token.split()
            index = int(parts[-1]) if len(parts) > 2 and parts[-1].isdigit() else 1
            index = max(1, index)
            users = load_registered_users(config, deployment, model)
            logger.info(
                "Resolving %s for %s/%s: have %s registered user(s)",
                user_token, deployment, model, len(users),
            )
            if len(users) < index:
                missing = index - len(users)
                created = api_user_factory(count=missing, user_password=password)
                if isinstance(created, dict):
                    logger.info("Resolved %s via API creation", user_token)
                    return created["email"]
                users = created
                if len(users) < index:
                    users = load_registered_users(config, deployment, model)
            if len(users) < index:
                raise IndexError(
                    f"Registered users not available for '{user_token}' in {deployment}/{model}"
                )
            logger.info("Resolved %s from deployment config", user_token)
            return users[index - 1]["email"]
        if user_token == "registered user":
            return resolve("registered user 1", password)
        return user_token
    return resolve


@pytest.fixture(scope="session")
def registered_user_password_resolver(pytestconfig):
    def resolve(user_token: str) -> str:
        deployment = pytestconfig.getoption("--deployment")
        model = pytestconfig.getoption("--model", default=None)
        return resolve_registered_user_password(user_token, deployment, model)
    return resolve


@pytest.fixture(scope="session")
def oauth_user_resolver():
    """Resolve a third-party provider name ('google'/'apple') to its account from the environment."""
    def resolve(provider: str, platform: str = None) -> dict:
        prefix = provider.upper()
        suffix = f"_{platform.upper()}" if platform else ""
        # Platform-specific account is all-or-nothing; else fall back to the shared account.
        base = suffix if (suffix and os.environ.get(f"{prefix}_OAUTH_EMAIL{suffix}")) else ""
        account = {
            "email": os.environ.get(f"{prefix}_OAUTH_EMAIL{base}"),
            "password": os.environ.get(f"{prefix}_OAUTH_PASSWORD{base}"),
            "totp_secret": os.environ.get(f"{prefix}_OAUTH_TOTP_SECRET{base}"),
        }
        if not account["email"] or not account["password"]:
            raise KeyError(
                f"{prefix}_OAUTH_EMAIL / {prefix}_OAUTH_PASSWORD not set; "
                "add them to ~/.esp_test_secrets.env (loaded via scripts/setup_test_env.sh)")
        return account
    return resolve


@pytest.fixture(scope="function")
def provision_config_resolver(hardware_config):
    """Resolve provisioning tokens (ssid, ssid_password, ...) from esp_devices.yaml wifi section."""
    return hardware_config.provision_value


@pytest.fixture(scope="session")
def hardware_config():
    """Load esp_devices.yaml hardware configuration once per session."""
    from hardware.config import HardwareConfig

    return HardwareConfig.load()


@pytest.fixture(scope="session")
def resource_manager(hardware_config):
    """Shared hardware service factory for the pytest session."""
    from hardware.manager import ResourceManager

    manager = ResourceManager.get_instance(hardware_config)
    manager.refresh_inventory()
    return manager


@pytest.fixture(scope="function")
def hardware_session(request, resource_manager, per_test_debug_dir):
    """
    Mutable per-test hardware context populated by BDD steps.

    Steps orchestrate: allocate → reset → flash → serial log → release.
    """
    session = {
        "requirement": None,
        "resource": None,        # most-recently acquired chip (single-chip tests)
        "resources": [],         # every chip acquired this test (multi-chip safe)
        "build_metadata": None,
        "firmware_image": None,
        "artifact_dir": per_test_debug_dir,
        "failed": False,
        "error": "",
        "test_name": request.node.nodeid,
    }
    yield session

    # Release every chip the test acquired, except the session-held E2E chip (e2e_device_hold frees it at session end).
    resources = session.get("resources") or ([session["resource"]] if session.get("resource") else [])
    e2e_held = session.get("e2e_held")
    resources = [r for r in resources if r is not e2e_held]
    from hardware.qr import QrDisplay

    QrDisplay.close()  # self-guarded by its _active flag; covers chipless scan tests (corrupted QR) too
    for resource in resources:
        try:
            resource_manager.serial_logger.stop(resource)
        except Exception as error:
            logger.warning("Serial stop during teardown failed for %s: %s", resource.mac_address, error)
        resource_manager.release(
            resource.mac_address,
            failed=session.get("failed", False),
            error=session.get("error", ""),
        )

    return session


@pytest.fixture(scope="session")
def e2e_device_hold(resource_manager):
    """Holds the E2E chip's reservation for the whole run so it is provisioned once and reused across e2e scenarios."""
    hold = {"resource": None, "node_id": None}
    yield hold
    resource = hold.get("resource")
    if resource is not None:
        try:
            resource_manager.serial_logger.stop(resource)
        except Exception:
            pass
        resource_manager.release(resource.mac_address)


@pytest.fixture(scope="session")
def login_session_state():
    """Last successfully logged-in email, tracked across scenarios so a non-user-management test can reuse an already-logged-in session (iOS keeps the login even as the per-test driver is recreated)."""
    return {}


@when(parsers.parse('user login with "{email}" and "{password}"'))
@given(parsers.parse('user login with "{email}" and "{password}"'))
def login_with_credentials(
    request,
    helper,
    email,
    password,
    registered_user_resolver,
    registered_user_password_resolver,
    login_session_state,
):
    email = registered_user_resolver(email)
    resolved_password = registered_user_password_resolver(password)
    logged_in = getattr(helper.login, "logged_in_on_entry", False)
    is_user_mgmt = "01_user_management" in str(getattr(request.node, "nodeid", ""))
    if logged_in and not is_user_mgmt and email == login_session_state.get("email"):
        logger.info("Session already logged in as %s; reusing it (skipping re-login)", email)
        helper.home.go_home()
        return
    if logged_in:
        helper.login.logout_to_login_screen()
    helper.login.perform_login(email, resolved_password)
    login_session_state["email"] = email


def _coerce_param_value(value):
    """Map a feature-file param string to a python value (bool / int / str)."""
    token = str(value).strip()
    low = token.lower()
    if low in ("on", "true"):
        return True
    if low in ("off", "false"):
        return False
    if token.lstrip("-").isdigit():
        return int(token)
    return token


@pytest.fixture
def primary_cloud(pytestconfig, registered_user_resolver, registered_user_password_resolver):
    """Deployment-appropriate cloud client authenticated as 'registered user 1' (None if uri/creds unavailable)."""
    return _cloud_for_user(pytestconfig, registered_user_resolver, registered_user_password_resolver)


def _cloud_for_user(pytestconfig, registered_user_resolver, registered_user_password_resolver):
    """Deployment-appropriate cloud client for the scenario's 'registered user 1' (None if uri/creds unavailable)."""
    from utils.rainmaker_cloud import cloud_for

    deployment = pytestconfig.getoption("--deployment")
    env_config = _load_deployment_config(deployment).get(deployment, {}) or {}
    if not env_config.get("uri"):
        return None
    try:
        email = registered_user_resolver("registered user 1")
        password = registered_user_password_resolver("registered user 1 password")
        return cloud_for(env_config, email, password)
    except Exception as error:
        logger.warning("Could not build cloud client: %s", error)
        return None


def _online_node_ids(cloud, chip_type):
    """Snapshot of cloud node_ids currently online for `chip_type` silicon (empty set if cloud unavailable)."""
    if cloud is None:
        return set()
    try:
        nodes = cloud.nodes()
    except Exception as error:
        logger.warning("Cloud node lookup failed (%s); cannot confirm online state", error)
        return set()
    out = set()
    for n in nodes:
        if not n.get("online"):
            continue
        platform = str(n.get("platform", "")).lower()
        if platform:
            if platform == str(chip_type).lower():
                out.add(n["node_id"])
        elif "matter" not in (n.get("capabilities") or []):
            out.add(n["node_id"])
    return out


def _read_node_id_from_serial(resource_manager, resource, timeout=20):
    """Read the RainMaker node id via the 'get-node-id' console command WITHOUT resetting the chip (preserves live device/param state); parses 'Node ID: <id>' or the boot 'Node ID ----- <id>'."""
    import time as _time
    deadline = _time.time() + timeout
    while _time.time() < deadline:
        try:
            resource_manager.serial_logger.send_command(resource, "get-node-id")
        except Exception:
            pass
        _time.sleep(2)
        for line in list(resource_manager.serial_logger.get_live_lines(resource) or []):
            if "Node ID" in line:
                parts = line.split("Node ID", 1)[1].strip(" -:\t\r\n").split()
                if parts:
                    return parts[0]
    return None


def _poll_node_online(cloud, node_id, timeout=60):
    """Poll the cloud until node_id reports online (a chip we reset reconnects in ~15-30s)."""
    import time as _time
    if cloud is None or not node_id:
        return False
    deadline = _time.time() + timeout
    while _time.time() < deadline:
        try:
            if any(n.get("node_id") == node_id and n.get("online") for n in cloud.nodes()):
                return True
        except Exception:
            pass
        _time.sleep(5)
    return False


def _name_e2e_node(cloud, node_id, fw_name, target_name):
    """Rename the reused node to target_name and seed timezone (best-effort)."""
    if cloud is None or not node_id:
        return
    try:
        by_id = {n["node_id"]: n for n in cloud.nodes()}
        if by_id.get(node_id, {}).get("name") != target_name:
            cloud.set_name(node_id, fw_name, target_name)
        if not by_id.get(node_id, {}).get("tz"):
            cloud.set_tz(node_id)
    except Exception as error:
        logger.warning("Cloud naming/timezone setup failed (%s); will fall back to in-app rename", error)


def _provision_reserved_chip(cloud, helper, hardware_session, resource_manager, request,
                             provision_config_resolver, target_name, resource, chip_type):
    """BLE-provision an already-reserved chip (flash led_light, drive the app add-device flow) and name it target_name; the chip stays held."""
    import json as _json
    import time as _time
    from hardware.models import ResourceStatus
    from hardware.requirements import HardwareRequirement
    from hardware.qr import QrPayloadExtractor

    e2e_log.warning("No online E2E device; BLE-provisioning reserved chip %s (%s)", resource.mac_address, resource.port)
    requirement = HardwareRequirement(chip_type=chip_type, product="led_light", prov_mode="ble", chal_resp=None,
                                      deployment=deployment_type(request.config.getoption("--deployment")))
    hardware_session["requirement"] = requirement
    metadata = resource_manager.firmware.load_metadata(requirement)
    resource_manager.firmware.validate(requirement, metadata)
    image = resource_manager.firmware.resolve_image(requirement, metadata)
    resource_manager.serial_logger.stop(resource)
    resource_manager.update_status(resource.mac_address, ResourceStatus.FLASHING)
    resource_manager.flasher.flash(resource, image)
    resource_manager.flasher.hard_reset(resource, image)
    resource.build_metadata = metadata
    log_path = hardware_session["artifact_dir"].serial_log_path(resource)
    resource_manager.serial_logger.start(resource, log_path, wait_for_port=True, trigger_reset=True)
    request.node._chip_serial_log_path = str(log_path)
    resource_manager.serial_logger.wait_for_bytes(resource, min_bytes=100, timeout=20)

    live_lines = resource_manager.serial_logger.get_live_lines(resource)
    payload = QrPayloadExtractor.from_log_file(Path(resource.serial_log_path), timeout=60, poll_lines=live_lines)
    if not payload:
        pytest.skip(f"No QR provisioning payload from {resource.mac_address} within 60s; cannot BLE-provision the E2E device")
    info = QrPayloadExtractor.parse(payload)
    if not info:
        pytest.skip(f"Unparseable QR provisioning payload from {resource.mac_address}: {str(payload)[:120]!r}")
    ssid = provision_config_resolver("ssid")
    password = provision_config_resolver("ssid_password")

    helper.home.go_home()
    helper.add_device.open_from_home()
    helper.add_device.open_selection_from_scanner()
    helper.add_device.select_bluetooth_option()
    helper.scan_ble.select_device(info.get("name"))
    if helper.pop.check_screen_displayed(timeout=5):
        helper.pop.enter_pop(info.get("pop", ""))
    helper.connect_wifi.check_screen_displayed(timeout=5)
    helper.connect_wifi.open_join_other_network_modal()
    helper.connect_wifi.enter_join_network_credentials(ssid, password)
    helper.connect_wifi.connect_join_network()
    helper.provision.assert_all_steps_successful(timeout=90)
    reached_home = False
    for _ in range(10):
        if helper.home.check_screen_displayed(timeout=2):
            reached_home = True
            break
        try:
            if helper.name_device.check_screen_displayed(timeout=1, quiet=True):
                helper.name_device.rename_device(target_name)
                helper.name_device.tap_continue()
            elif helper.add_to_room.check_screen_displayed(timeout=1, quiet=True):
                helper.add_to_room.skip()
            elif helper.guide.check_screen_displayed(timeout=1, quiet=True):
                helper.guide.tap_continue()
            elif helper.provision.check_screen_displayed(timeout=1, quiet=True):
                helper.provision.tap_continue()
            else:
                _time.sleep(1)
        except Exception as error:
            e2e_log.info("Post-provision navigation retry (%s): %s", type(error).__name__, error)
            _time.sleep(1)
    if not reached_home:
        raise AssertionError("Provisioned device did not return to the home screen after naming/room setup")
    resource_manager.update_status(resource.mac_address, ResourceStatus.RESERVED)


@given(parsers.parse('a reserved online "{device_name}" device'))
def reserve_online_device(request, helper, hardware_session, resource_manager, hardware_config,
                          pytestconfig, registered_user_resolver, registered_user_password_resolver,
                          provision_config_resolver, e2e_device_hold, device_name):
    """Reserve an E2E chip BY TYPE once and reuse the session-held chip across every e2e scenario (never re-provisioned or stolen mid-run)."""
    from utils.device_serial import DeviceSerial
    from hardware import BuildMetadata, record_hardware_report
    from hardware.exceptions import HardwareUnavailableException

    chip_type = str(hardware_config.raw.get("e2e_chip_type", "esp32c3")).lower()
    fw_name = str(hardware_config.raw.get("e2e_fw_name", "Light"))
    cloud = _cloud_for_user(pytestconfig, registered_user_resolver, registered_user_password_resolver)

    chosen = e2e_device_hold.get("resource")
    chosen_node = e2e_device_hold.get("node_id")
    if chosen is None:
        online_ids = _online_node_ids(cloud, chip_type)
        e2e_log.info("E2E reserve-by-type '%s'; online %s node(s): %s", chip_type, chip_type, online_ids or "none")
        held = []
        for _ in range(4):
            try:
                resource = resource_manager.acquire(chip_type, timeout=8, test_name=hardware_session.get("test_name"))
            except HardwareUnavailableException:
                break
            hardware_session.setdefault("resources", []).append(resource)
            log_path = hardware_session["artifact_dir"].serial_log_path(resource)
            # Do NOT reset: a reboot would wipe the online device's live param state and break E2E continuity.
            resource_manager.serial_logger.start(resource, log_path, wait_for_port=True, trigger_reset=False)
            node_id = _read_node_id_from_serial(resource_manager, resource, timeout=20)
            if node_id and node_id in online_ids:
                chosen, chosen_node = resource, node_id
                request.node._chip_serial_log_path = str(log_path)
                break
            e2e_log.info("Chip %s (node %s) is not the online E2E device; holding as provision candidate",
                         resource.mac_address, node_id)
            resource_manager.serial_logger.stop(resource)
            held.append((resource, node_id))

        if chosen is not None:
            e2e_log.info("Reusing online E2E chip %s (node %s) on %s", chosen.mac_address, chosen_node, chosen.port)
        else:
            assert held, f"No available {chip_type} chip to serve the E2E device"
            chosen, chosen_node = held.pop(0)
            _provision_reserved_chip(cloud, helper, hardware_session, resource_manager, request,
                                     provision_config_resolver, device_name, chosen, chip_type)
            if not chosen_node:
                chosen_node = _read_node_id_from_serial(resource_manager, chosen, timeout=15)

        for resource, _ in held:
            resource_manager.serial_logger.stop(resource)
            resource_manager.release(resource.mac_address)
            if resource in hardware_session.get("resources", []):
                hardware_session["resources"].remove(resource)

        e2e_device_hold["resource"] = chosen
        e2e_device_hold["node_id"] = chosen_node
    else:
        e2e_log.info("Reusing session-held E2E chip %s (node %s) on %s", chosen.mac_address, chosen_node, chosen.port)

    _poll_node_online(cloud, chosen_node, timeout=60)
    _name_e2e_node(cloud, chosen_node, fw_name, device_name)

    # Per-scenario bindings; the chip is held by e2e_device_hold (session), not released between scenarios.
    hardware_session["resource"] = chosen
    hardware_session["e2e_held"] = chosen
    metadata = BuildMetadata(chip=chip_type, product="", firmware_type="Reserved (E2E)")
    chosen.build_metadata = metadata
    hardware_session["build_metadata"] = metadata
    record_hardware_report(request, chosen, metadata)
    hardware_session["device_serial"] = DeviceSerial(resource_manager, chosen, fw_name)
    if getattr(chosen, "serial_log_path", None):
        request.node._chip_serial_log_path = str(chosen.serial_log_path)

    # Baseline snapshot: the reused/provisioned node's cloud param values before the action.
    sel_node = {}
    if cloud is not None and chosen_node:
        try:
            sel_node = next((n for n in cloud.nodes() if n.get("node_id") == chosen_node), {})
        except Exception:
            sel_node = {}
    hardware_session["baseline_params"] = (sel_node.get("params") or {}).get(fw_name, {})
    hardware_session["node_id"] = chosen_node or sel_node.get("node_id")
    hardware_session["fw_name"] = fw_name
    param_name = (sel_node.get("params") or {}).get(fw_name, {}).get("Name")
    aliases = []
    for candidate in (param_name, sel_node.get("name"), "Light"):
        if candidate and candidate != device_name and candidate not in aliases:
            aliases.append(candidate)
    helper.home.ensure_device_name(device_name, aliases)


@when(parsers.parse('the device is prepared with "{param}" set to "{value}"'))
def prepare_device_param(hardware_session, param, value):
    """Seed a baseline param on the device over serial so a later change is observable."""
    ds = hardware_session["device_serial"]
    ds.set_param(param, _coerce_param_value(value))


@when(parsers.parse('the device reports "{param}" as "{value}"'))
def device_reports_param(hardware_session, param, value):
    """Change a param on the device itself (reported to cloud) — automation triggers and fw-initiated sync checks."""
    ds = hardware_session["device_serial"]
    hardware_session["serial_since"] = ds.marker()
    hardware_session.get("set_values", {}).pop(param, None)
    ds.set_param(param, _coerce_param_value(value))


@when(parsers.parse('the cloud sets "{param}" to "{value}" for "{device}"'))
def cloud_sets_param(pytestconfig, registered_user_resolver, registered_user_password_resolver,
                     hardware_session, param, value, device):
    """Write a param from the cloud side so delivery to the device (serial) and app can be verified."""
    cloud = _cloud_for_user(pytestconfig, registered_user_resolver, registered_user_password_resolver)
    assert cloud is not None, "Cloud client unavailable; cannot set cloud params"
    node_id = hardware_session.get("node_id")
    fw_name = hardware_session.get("fw_name", "Light")
    assert node_id, "No reserved node id recorded; was the device reserved?"
    hardware_session["serial_since"] = hardware_session["device_serial"].marker()
    hardware_session.get("set_values", {}).pop(param, None)
    cloud.set_param(node_id, {fw_name: {param: _coerce_param_value(value)}})
    e2e_log.info("Cloud set %s=%s for %s (%s)", param, value, device, node_id)


def _serial_since(hardware_session):
    """Serial-log index scoping verification to output after the trigger (set once per scenario)."""
    since = hardware_session.get("serial_since")
    if since is None:
        since = hardware_session["device_serial"].marker()
        hardware_session["serial_since"] = since
    return since


@then(parsers.parse('the home card should show "{device}" power as "{state}"'))
def home_card_power_should_be(helper, device, state):
    import time
    helper.home.go_home()
    deadline = time.time() + 10
    actual = None
    while time.time() < deadline:
        actual = helper.home.read_card_power(device, timeout=3)
        if actual == state:
            return
        time.sleep(1)
    assert actual == state, f"Home card power for {device} is {actual}, expected {state}"


@when(parsers.parse('user toggles "{device}" power to "{state}" from the home screen'))
def toggle_home_power(helper, hardware_session, device, state):
    helper.home.go_home()
    _serial_since(hardware_session)
    helper.home.set_card_power(device, state == "on")


@then(parsers.parse('device "{device}" should be visible on the home screen'))
def device_visible_on_home(helper, device):
    helper.home.go_home()
    assert helper.home.is_device_visible(device, timeout=10, attempts=2), f"{device} is not visible on the home screen"


def _expected_value(hardware_session, param, value):
    """The value to verify: the slider's actually-applied readback if captured, else the nominal."""
    return hardware_session.get("set_values", {}).get(param, _coerce_param_value(value))


_TOL = 3  # slider read/apply tolerance
POST_LANDING_SETTLE_TIMEOUT = 60


@then(parsers.re(r'the device log should show (?P<pairs>.+?)(?: within "(?P<seconds>\d+)" seconds)?$'))
def verify_device_log_params(hardware_session, pairs, seconds):
    """Verify one or more params from the device's serial log in a single pass."""
    checks = re.findall(r'"([^"]+)"\s+set to\s+"([^"]+)"', pairs)
    assert checks, f"No param checks parsed from: {pairs!r}"
    ds = hardware_session["device_serial"]
    since = _serial_since(hardware_session)
    timeout = int(seconds) if seconds else 30
    failures = []
    for param, value in [c for c in checks if c[1] != "unchanged"]:
        expected = _expected_value(hardware_session, param, value)
        if not ds.wait_for_param(param, expected, timeout=timeout, since=since):
            failures.append(f"{param} set to {value}")
    for param, _ in [c for c in checks if c[1] == "unchanged"]:
        if ds.param_written_since(param, since=since):
            failures.append(f"{param} was written (expected unchanged)")
    assert not failures, "Device serial did not confirm: " + "; ".join(failures)


@then(parsers.re(r'the cloud should show (?P<pairs>.+?) for "(?P<device>[^"]+)"$'))
def verify_cloud_params(pytestconfig, registered_user_resolver, registered_user_password_resolver,
                        hardware_session, pairs, device):
    """Verify the cloud's reported param state for the reserved node matches expectations (poll generously)."""
    import time as _time
    checks = re.findall(r'"([^"]+)"\s+as\s+"([^"]+)"', pairs)
    assert checks, f"No param checks parsed from: {pairs!r}"
    cloud = _cloud_for_user(pytestconfig, registered_user_resolver, registered_user_password_resolver)
    assert cloud is not None, "Cloud client unavailable; cannot verify cloud params"
    node_id = hardware_session.get("node_id")
    fw_name = hardware_session.get("fw_name", "Light")
    assert node_id, "No reserved node id recorded; was the device reserved?"
    mismatches, reported = [], {}
    deadline = _time.time() + 90
    while _time.time() < deadline:
        node = next((n for n in cloud.nodes() if n.get("node_id") == node_id), {})
        reported = (node.get("params") or {}).get(fw_name, {})
        mismatches = []
        for param, value in checks:
            expected = _expected_value(hardware_session, param, value)
            actual = reported.get(param)
            if isinstance(expected, bool):
                ok = bool(actual) == expected
            else:
                ok = actual is not None and abs(int(actual) - int(expected)) <= _TOL
            if not ok:
                mismatches.append(f"{param}={actual} (expected {value})")
        if not mismatches:
            e2e_log.info("Cloud validation OK for %s: %s", device, checks)
            return
        _time.sleep(3)
    assert not mismatches, f"Cloud mismatches for {device}: " + "; ".join(mismatches)


@then(parsers.re(r'the app should show (?P<pairs>.+?) for "(?P<device>[^"]+)"'))
def verify_app_reflects_params(helper, hardware_session, pairs, device):
    """Confirm the app's device screen reflects the params — one screen open, reading"""
    import time as _time
    checks = re.findall(r'"([^"]+)"\s+as\s+"([^"]+)"', pairs)
    assert checks, f"No param checks parsed from: {pairs!r}"
    baseline = hardware_session.get("baseline_params") or {}
    helper.home.go_home()
    helper.home.open_device(device)
    helper.control.dismiss_join_wifi_dialog()
    mismatches = []
    for param, value in checks:
        if value == "unchanged":
            expected = baseline.get(param)
            if expected is None:
                e2e_log.info("App validation: no baseline for '%s'; skipping unchanged check", param)
                continue
        else:
            expected = _expected_value(hardware_session, param, value)
        is_bool = isinstance(expected, bool)
        want = ("on" if expected else "off") if is_bool else int(expected)
        actual = None
        deadline = _time.time() + 20
        while _time.time() < deadline:
            helper.control.dismiss_join_wifi_dialog()
            actual = helper.home.read_power_state(timeout=2) if is_bool else helper.home.read_slider_value(param, timeout=2)
            if (is_bool and actual == want) or (not is_bool and actual is not None and abs(actual - want) <= _TOL):
                break
            _time.sleep(1)
        ok = (actual == want) if is_bool else (actual is not None and abs(actual - want) <= _TOL)
        e2e_log.info("App validation: %s=%s (want %s) -> %s", param, actual, want, "OK" if ok else "MISMATCH")
        if not ok:
            mismatches.append(f"{param}={actual} (expected {value})")
    assert not mismatches, f"App mismatches for {device}: " + "; ".join(mismatches)
    helper.home.go_home()

@given("the app is launched")
def app_launched(helper):
    assert helper.driver is not None

@given("user should land on the home screen")
@then("user should land on the home screen")
def land_on_home_page(helper):
    assert helper.home.wait_home_after_login(), "Should be on home screen"

@given("user should be on login screen")
def given_login_screen(request, helper):
    """Ensure app is on login screen; force logout for user-management flows, else defer it."""
    from utils.registered_user_resolver import deployment_type
    first_launch = not getattr(request.session, "_landing_handled", False)
    settled = helper.login.dismiss_landing_if_shown(
        deployment_type(request.config.getoption("--deployment")),
        timeout=90 if first_launch else POST_LANDING_SETTLE_TIMEOUT,
    )
    if settled:
        request.session._landing_handled = True
    is_user_mgmt = "01_user_management" in str(getattr(request.node, "nodeid", ""))
    helper.login.ensure_login_screen(force_logout=is_user_mgmt)


@then("user should be on login screen")
def then_login_screen(helper):
    """Assert login screen is displayed"""
    assert helper.login.check_screen_displayed(timeout=7), "Login screen is not displayed"


def _get_model_index_based_port(model: str, base_port: int = 4444, port_increment: int = 1000) -> int:
    """Assign port based on model's index in mobiles.yaml configuration"""
    try:
        # Load mobiles configuration
        config_path = Path("config/mobiles.yaml")
        if not config_path.exists():
            logger.warning("mobiles.yaml not found, using default port")
            return base_port
            
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
            
        mobiles = config.get('mobiles', {})
        if not mobiles:
            logger.warning("No mobiles found in config, using default port")
            return base_port
            
        # Get ordered list of model names (preserves YAML order)
        model_names = list(mobiles.keys())
        
        # Find index of the requested model
        if model in model_names:
            model_index = model_names.index(model)
            assigned_port = base_port + (model_index * port_increment)
            logger.info(f"📋 Model '{model}' found at index {model_index} in mobiles.yaml")
            logger.info(f"🔧 Assigned port range starting from {assigned_port}")
            return assigned_port
        else:
            # Model not in config - assign based on hash to be consistent
            import hashlib
            hash_value = int(hashlib.md5(model.encode()).hexdigest()[:4], 16)
            model_index = len(model_names) + (hash_value % 10)  # Add to end with some spread
            assigned_port = base_port + (model_index * port_increment)
            logger.warning(f"⚠️  Model '{model}' not found in mobiles.yaml")
            logger.info(f"🔧 Auto-assigned index {model_index}, port range starting from {assigned_port}")
            return assigned_port
            
    except Exception as e:
        logger.error(f"Error reading mobiles.yaml: {e}")
        return base_port

def pytest_addoption(parser):
    """Add custom command line options"""
    parser.addoption("--model", action="store", help="Device model (e.g., SM-M315F) or comma-separated models")
    parser.addoption("--base-port", action="store", default=4444, type=int, help="Base port for Appium servers")
    parser.addoption("--start-servers", action="store_true", default=True, help="Auto-start Appium servers")
    parser.addoption("--debug-dir", action="store", default="debug", help="Debug artifacts directory")
    parser.addoption("--enable-recording", action="store_true", default=True, help="Enable automatic screen recording")
    parser.addoption("--install-app", action="store", default="y", help="Install app before tests (y/n)")
    parser.addoption("--reboot-device", action="store", default="y", help="Reboot the phone once at session start (y/n)")
    parser.addoption("--deployment", action="store", default="rm", help="Deployment name in config/deployment.yaml")
    parser.addoption("--scale-count", action="store", type=int,
                     default=int(os.environ.get("SCALE_COUNT", "5")),
                     help="Iterations for @scale scenarios (env: SCALE_COUNT)")
    parser.addoption("--active-sdk", action="store", default=None, help="SDK the app under test was built with, overriding ACTIVE_SDK (ids in config/sdk.identifiers.ts)")
    parser.addoption("--fresh-users", action="store_true", default=False, help="Clear persisted registered users at session start so the run creates fresh ones")


def _active_sdk_under_test(config) -> str:
    """The SDK id the installed app was built with: --active-sdk wins, else ACTIVE_SDK (CI exports it from .select_deployment)."""
    active_sdk = (config.getoption("--active-sdk") or os.environ.get("ACTIVE_SDK") or "").strip()
    if not active_sdk:
        raise pytest.UsageError(
            "Cannot tell which SDK the app under test was built with: ACTIVE_SDK is unset and --active-sdk was "
            "not passed. CI exports ACTIVE_SDK from the .select_deployment anchor in .gitlab-ci.yml; for a manual "
            "run export it or pass --active-sdk=<id from config/sdk.identifiers.ts>"
        )
    return active_sdk


def pytest_collection_modifyitems(config, items):
    """Deselect (do NOT collect, not merely skip) what the run cannot exercise: deployment.yaml `features` maps marker names to false for what the CLOUD lacks, and Matter suites need a Matter build (ACTIVE_SDK/--active-sdk), since the SDK family itself follows the deployment via the landing selection."""
    deployment = config.getoption("--deployment")
    try:
        deployments = _load_deployment_config(deployment)
    except Exception as error:
        raise pytest.UsageError(f"Cannot read the deployment config to gate tests: {error}")
    env_block = deployments.get(deployment) or {}
    if not env_block:
        known = ", ".join(sorted(name for name, block in deployments.items() if isinstance(block, dict) and block.get("type")))
        raise pytest.UsageError(f"Deployment '{deployment}' is not in config/deployment.yaml (known: {known or 'none'})")
    features = env_block.get("features", {}) or {}
    disabled = {name for name, enabled in features.items() if enabled is False}
    active_sdk = _active_sdk_under_test(config)
    matter_build = "matter" in active_sdk.lower()
    e2e_log.info(
        "Gating on deployment '%s' + SDK '%s' (matter build: %s): deployment disables %s",
        deployment, active_sdk, matter_build, sorted(disabled) or "nothing",
    )
    selected, deselected = [], []
    for item in items:
        markers = {marker.name for marker in item.iter_markers()}
        if disabled.intersection(markers) or (not matter_build and any("matter" in marker for marker in markers)):
            deselected.append(item)
        else:
            selected.append(item)
    if deselected:
        config.hook.pytest_deselected(items=deselected)
        items[:] = selected


def pytest_configure(config):
    """Configure pytest with Appium servers"""
    global grid_manager, debug_helper

    _active_sdk_under_test(config)
    
    debug_dir = config.getoption("--debug-dir")
    debug_helper = DebugHelper(debug_dir)
    
    # Initialize report plugin if available
    if REPORT_PLUGIN_AVAILABLE:
        try:
            plugin = PytestReportPlugin()
            config.pluginmanager.register(plugin, "pytest_report_plugin")
            logger.info("Report plugin registered")
        except Exception as e:
            logger.warning(f"Failed to register report plugin: {e}")
    
    # Device detection and verification (always enabled)
    detector = MobileDeviceDetector()
    
    # Verify specified models are available (default behavior)
    models = config.getoption("--model")
    if models:
        model_list = [m.strip() for m in models.split(",")]
        for model in model_list:
            # Sync when model not in mobiles.yaml (e.g. newly connected Pixel, new device)
            mobiles_config = detector.load_config()
            if model not in mobiles_config:
                logger.info(f"Model '{model}' not in mobiles.yaml, syncing from connected devices...")
                detector.sync_configuration()
                mobiles_config = detector.load_config()
            
            if model not in mobiles_config:
                available_models = detector.list_available_models()
                if available_models:
                    logger.error(f"Model '{model}' not found. Available: {', '.join(available_models)}")
                else:
                    logger.error(f"Model '{model}' not found. No devices connected. Connect device and run again.")
                raise ValueError(f"Model '{model}' not in config. Run with a connected device to auto-sync.")
            
            available, device_info = detector.verify_model_available(model)
            if not available:
                logger.warning(f"Model '{model}' is in config but not currently connected")
            else:
                logger.info(f"Model '{model}' is available ({device_info.platform} {device_info.version})")
    
    if config.getoption("--start-servers"):
        base_port_from_cli = config.getoption("--base-port")
        
        if models and base_port_from_cli == 4444:
            first_model = models.split(",")[0].strip()
            auto_base_port = _get_model_index_based_port(first_model, base_port_from_cli)
            base_port = auto_base_port
        else:
            base_port = base_port_from_cli
            
        grid_manager = AppiumGridManager(base_port=base_port, debug_dir=debug_dir)
        
        # Start servers for specified models
        if models:
            model_list = [m.strip() for m in models.split(",")]
            for model in model_list:
                logger.info(f"Starting Appium server for {model}")
                grid_manager.start_server(model)
    
    # Fresh-users: clear persisted registered users so the resolver creates new ones.
    if config.getoption("--fresh-users", False):
        try:
            from utils.registered_user_resolver import mutate_registered_users
            deployment = config.getoption("--deployment")
            for model in [m.strip() for m in (models or "").split(",") if m.strip()]:
                mutate_registered_users(deployment, model, lambda existing: [])
                logger.info("Cleared registered users for %s/%s (--fresh-users)", deployment, model)
        except Exception as e:
            logger.warning("Failed to clear registered users (--fresh-users): %s", e)

    # Register cleanup
    atexit.register(cleanup_servers)
    
    # Register custom markers
    config.addinivalue_line("markers", "multiple_devices: mark test to run on multiple devices")
    config.addinivalue_line("markers", "sanity: mark test as sanity test")
    config.addinivalue_line("markers", "open_wifi: needs the open (passwordless) lab AP; gate via deployment.yaml features")
    config.addinivalue_line("markers", "smoke: mark test as smoke test")
    config.addinivalue_line("markers", "regression: mark test as regression test")
    config.addinivalue_line("markers", "user_management: mark test as user management test")
    config.addinivalue_line("markers", "provisioning: mark tests ESP provisioning test")
    config.addinivalue_line("markers", "esp32c5: mark test as ESP32C5-specific")
    config.addinivalue_line("markers", "scale: mark test as a configurable-scale run")
    config.addinivalue_line("markers", "scene: mark test as scene E2E test")
    config.addinivalue_line("markers", "schedule: mark test as schedule E2E test")
    config.addinivalue_line("markers", "automation: mark test as automation E2E test")
    config.addinivalue_line("markers", "device_control: mark test as device param control E2E test")

def pytest_unconfigure(config):
    """Cleanup when pytest exits"""
    cleanup_servers()

def cleanup_servers():
    """Clean up Appium servers"""
    global grid_manager
    if grid_manager:
        try:
            grid_manager.cleanup()
        except Exception:
            pass  # Suppress cleanup errors

@pytest.fixture(scope="session")
def appium_grid():
    """Provide grid manager instance"""
    global grid_manager
    if not grid_manager:
        grid_manager = AppiumGridManager()
    return grid_manager

def _reboot_android_device(adb_path: str, udid: Optional[str], model: str, timeout: int = 180) -> bool:
    """
    Reboot an Android device and wait until it finishes booting.

    Args:
        adb_path: Path to ADB executable
        udid: Device UDID (optional)
        model: Device model name for logging
        timeout: Seconds to wait for the device to come back

    Returns:
        True once the device reports boot completed, False otherwise
    """
    adb_cmd = [adb_path]
    if udid:
        adb_cmd.extend(["-s", udid])
    try:
        logger.info(f"Rebooting {model} before the session")
        subprocess.run(adb_cmd + ["reboot"], capture_output=True, text=True, timeout=30)
    except Exception as e:
        logger.warning(f"Reboot command failed for {model}: {e}")
        return False

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            result = subprocess.run(adb_cmd + ["shell", "getprop", "sys.boot_completed"],
                                    capture_output=True, text=True, timeout=10)
            if result.returncode == 0 and result.stdout.strip() == "1":
                subprocess.run(adb_cmd + ["shell", "input", "keyevent", "82"],
                               capture_output=True, text=True, timeout=10)
                logger.info(f"{model} finished booting")
                return True
        except Exception:
            pass
        time.sleep(5)

    logger.warning(f"{model} did not report boot completed within {timeout}s; continuing anyway")
    return False


def _ensure_android_wifi_connected(adb_cmd: list, model: str, timeout: int = 120) -> bool:
    """
    Wait until the phone is associated to the lab Wi-Fi after a reboot, enabling the radio if it came back off.

    A reboot can leave Wi-Fi disabled or still associating; the app then fails every
    cloud call with "Network request failed" and the first tests of the session fail
    for a reason that has nothing to do with them.
    """
    expected = os.getenv("PROVISION_WIFI_SSID")
    deadline = time.time() + timeout
    enable_attempted = False
    last_status = ""
    while time.time() < deadline:
        try:
            result = subprocess.run(adb_cmd + ["shell", "cmd", "wifi", "status"],
                                    capture_output=True, text=True, timeout=15)
            last_status = (result.stdout or "").strip()
        except Exception as error:
            logger.debug("Wi-Fi status probe failed on %s: %s", model, error)
            last_status = ""

        if "connected to" in last_status:
            if expected and f'"{expected}"' not in last_status:
                logger.warning("%s is on a different Wi-Fi than %r: %s", model, expected,
                               last_status.splitlines()[-1] if last_status else "")
            else:
                logger.info("%s is connected to Wi-Fi %r", model, expected)
            return True

        if not enable_attempted and "enabled" not in last_status:
            logger.info("Wi-Fi is off on %s after reboot; enabling it", model)
            for enable_cmd in (["shell", "cmd", "wifi", "set-wifi-enabled", "enabled"],
                               ["shell", "svc", "wifi", "enable"]):
                try:
                    subprocess.run(adb_cmd + enable_cmd, capture_output=True, text=True, timeout=15)
                except Exception as error:
                    logger.debug("Wi-Fi enable via %s failed: %s", enable_cmd[-1], error)
            enable_attempted = True
        time.sleep(5)

    logger.warning("%s did not associate to Wi-Fi within %ss (last status: %s); cloud-dependent tests will likely fail",
                   model, timeout, last_status.replace("\n", " | ")[:160])
    return False


def _reboot_ios_device(udid: Optional[str], model: str, timeout: int = 180) -> bool:
    """
    Restart an iOS device with idevicediagnostics and wait until it responds again.

    Args:
        udid: Device UDID (optional)
        model: Device model name for logging
        timeout: Seconds to wait for the device to come back

    Returns:
        True once the device answers ideviceinfo, False otherwise
    """
    restart_cmd = ["idevicediagnostics"]
    info_cmd = ["ideviceinfo"]
    if udid:
        restart_cmd.extend(["-u", udid])
        info_cmd.extend(["-u", udid])
    try:
        logger.info(f"Restarting {model} before the session")
        subprocess.run(restart_cmd + ["restart"], capture_output=True, text=True, timeout=30)
    except FileNotFoundError:
        logger.warning("idevicediagnostics not found; skipping iOS reboot")
        return False
    except Exception as e:
        logger.warning(f"Restart command failed for {model}: {e}")
        return False

    time.sleep(15)
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            result = subprocess.run(info_cmd + ["-k", "DeviceName"],
                                    capture_output=True, text=True, timeout=10)
            if result.returncode == 0 and result.stdout.strip():
                logger.info(f"{model} is back online")
                return True
        except Exception:
            pass
        time.sleep(5)

    logger.warning(f"{model} did not come back within {timeout}s; continuing anyway")
    return False


def _uninstall_android_app(adb_path: str, udid: Optional[str], package: str, model: str) -> bool:
    """
    Uninstall Android app using ADB.

    Args:
        adb_path: Path to ADB executable
        udid: Device UDID (optional)
        package: App package name
        model: Device model name for logging

    Returns:
        True if app was uninstalled or not found, False on error
    """
    try:
        adb_cmd = [adb_path]
        if udid:
            adb_cmd.extend(["-s", udid])
        
        check_cmd = adb_cmd + ["shell", "pm", "list", "packages", package]
        result = subprocess.run(check_cmd, capture_output=True, text=True, timeout=10)
        
        if result.returncode == 0 and package in result.stdout:
            logger.info(f"App {package} is installed on {model}, uninstalling...")
            uninstall_cmd = adb_cmd + ["uninstall", package]
            uninstall_result = subprocess.run(uninstall_cmd, capture_output=True, text=True, timeout=30)
            
            if uninstall_result.returncode == 0:
                logger.info(f"Successfully uninstalled {package} from {model}")
                return True
            else:
                logger.warning(f"Failed to uninstall {package}: {uninstall_result.stderr}")
                return False
        else:
            logger.info(f"App {package} is not installed on {model}")
            return True
            
    except subprocess.TimeoutExpired:
        logger.error(f"Uninstall timeout for {package} on {model}")
        return False
    except Exception as e:
        logger.error(f"Error uninstalling {package} from {model}: {e}")
        return False


def _install_android_app(adb_path: str, udid: Optional[str], apk_path: str, package: str, model: str) -> bool:
    """
    Install Android app using ADB.

    Args:
        adb_path: Path to ADB executable
        udid: Device UDID (optional)
        apk_path: Path to APK file
        package: App package name
        model: Device model name for logging

    Returns:
        True if installation successful, False otherwise
    """
    try:
        if not os.path.exists(apk_path):
            logger.error(f"APK file not found: {apk_path}")
            return False
        
        # Build ADB command
        adb_cmd = [adb_path]
        if udid:
            adb_cmd.extend(["-s", udid])
        
        # Install APK with replace flag
        logger.info(f"Installing {package} on {model} from {apk_path}")
        install_cmd = adb_cmd + ["install", "-r", apk_path]
        install_result = subprocess.run(install_cmd, capture_output=True, text=True, timeout=120)
        
        if install_result.returncode == 0:
            logger.info(f"Successfully installed {package} on {model}")
            return True
        else:
            logger.error(f"Failed to install {package}: {install_result.stderr}")
            return False
            
    except subprocess.TimeoutExpired:
        logger.error(f"Install timeout for {package} on {model}")
        return False
    except Exception as e:
        logger.error(f"Error installing {package} on {model}: {e}")
        return False


def _uninstall_ios_app(udid: Optional[str], bundle_id: str, model: str) -> bool:
    """
    Uninstall iOS app using devicectl (ships with Xcode), with
    ideviceinstaller as fallback for hosts without Xcode.

    Args:
        udid: Device UDID (required for devicectl)
        bundle_id: App bundle ID
        model: Device model name for logging

    Returns:
        True if app was uninstalled or not found, False on error
    """
    try:
        if udid:
            uninstall_cmd = ["xcrun", "devicectl", "device", "uninstall", "app",
                             "--device", udid, bundle_id]
            result = subprocess.run(uninstall_cmd, capture_output=True, text=True, timeout=60)
            if result.returncode == 0:
                logger.info(f"Uninstalled {bundle_id} from {model} via devicectl")
                return True
            # Not installed comes back as an error from devicectl — treat as success
            if "was not found" in (result.stderr or "") or "not installed" in (result.stderr or "").lower():
                logger.info(f"App {bundle_id} is not installed on {model}")
                return True
            logger.warning(f"devicectl uninstall failed: {result.stderr.strip()[:200]}")

        # Fallback: ideviceinstaller (libimobiledevice)
        idevice_cmd = ["ideviceinstaller"] + (["-u", udid] if udid else [])
        result = subprocess.run(idevice_cmd + ["list"], capture_output=True, text=True, timeout=10)
        if result.returncode == 0 and bundle_id in result.stdout:
            uninstall_result = subprocess.run(
                idevice_cmd + ["uninstall", bundle_id], capture_output=True, text=True, timeout=60
            )
            if uninstall_result.returncode == 0:
                logger.info(f"Successfully uninstalled {bundle_id} from {model}")
                return True
            logger.warning(f"Failed to uninstall {bundle_id}: {uninstall_result.stderr}")
            return False
        logger.info(f"App {bundle_id} is not installed on {model}")
        return True  # Not installed is considered success

    except FileNotFoundError:
        logger.error("Neither devicectl (Xcode) nor ideviceinstaller available for iOS uninstall")
        return False
    except subprocess.TimeoutExpired:
        logger.error(f"Uninstall timeout for {bundle_id} on {model}")
        return False
    except Exception as e:
        logger.error(f"Error uninstalling {bundle_id} from {model}: {e}")
        return False


def _install_ios_app(udid: Optional[str], ipa_path: str, bundle_id: str, model: str) -> bool:
    """
    Install iOS app using devicectl (ships with Xcode), with
    ideviceinstaller as fallback for hosts without Xcode.

    Args:
        udid: Device UDID (required for devicectl)
        ipa_path: Path to IPA file
        bundle_id: App bundle ID
        model: Device model name for logging

    Returns:
        True if installation successful, False otherwise
    """
    try:
        if not os.path.exists(ipa_path):
            logger.error(f"IPA file not found: {ipa_path}")
            return False

        logger.info(f"Installing {bundle_id} on {model} from {ipa_path}")
        if udid:
            install_cmd = ["xcrun", "devicectl", "device", "install", "app",
                           "--device", udid, ipa_path]
            result = subprocess.run(install_cmd, capture_output=True, text=True, timeout=180)
            if result.returncode == 0:
                logger.info(f"Successfully installed {bundle_id} on {model} via devicectl")
                return True
            logger.warning(f"devicectl install failed: {result.stderr.strip()[:200]}")

        # Fallback: ideviceinstaller (libimobiledevice) — 1.2.0+ takes subcommands, not -i
        idevice_cmd = ["ideviceinstaller"] + (["-u", udid] if udid else [])
        install_result = subprocess.run(
            idevice_cmd + ["install", ipa_path], capture_output=True, text=True, timeout=180
        )
        if install_result.returncode == 0:
            logger.info(f"Successfully installed {bundle_id} on {model}")
            return True
        logger.error(f"Failed to install {bundle_id}: {install_result.stderr}")
        return False

    except FileNotFoundError:
        logger.error("Neither devicectl (Xcode) nor ideviceinstaller available for iOS install")
        return False
    except subprocess.TimeoutExpired:
        logger.error(f"Install timeout for {bundle_id} on {model}")
        return False
    except Exception as e:
        logger.error(f"Error installing {bundle_id} on {model}: {e}")
        return False


_UIA2_CRASH_SIGNATURES = (
    "instrumentation process is not running",
    "INSTRUMENTATION_ABORTED",
    "Process crashed",
    "cannot be proxied to UiAutomator2",
)
_uia2_whitelisted_udids = set()


def _is_uia2_crash(error) -> bool:
    text = str(error)
    return any(sig in text for sig in _UIA2_CRASH_SIGNATURES)


def _adb_prefix(udid):
    cmd = ["adb"]
    if udid:
        cmd += ["-s", udid]
    return cmd


def _whitelist_uiautomator2(udid):
    """Keep the uia2 server out of doze/background kill (Motorola aggressively reaps instrumentation)."""
    if udid in _uia2_whitelisted_udids:
        return
    for pkg in ("io.appium.uiautomator2.server", "io.appium.uiautomator2.server.test"):
        try:
            subprocess.run(_adb_prefix(udid) + ["shell", "dumpsys", "deviceidle", "whitelist", f"+{pkg}"],
                           capture_output=True, text=True, timeout=15)
        except Exception as error:
            logger.warning("uia2 doze whitelist failed for %s: %s", pkg, error)
    _uia2_whitelisted_udids.add(udid)
    logger.info("uia2 server whitelisted from doze on %s", udid or "default device")


def _unwedge_android_uiautomator2(udid, model="android device"):
    """Clear a wedged uiautomation registration: only a reboot reliably releases it, then drop the stale uia2 apks so Appium reinstalls fresh."""
    _reboot_android_device("adb", udid, model)
    _ensure_android_wifi_connected(_adb_prefix(udid), model)
    for pkg in ("io.appium.uiautomator2.server", "io.appium.uiautomator2.server.test"):
        try:
            subprocess.run(_adb_prefix(udid) + ["uninstall", pkg], capture_output=True, text=True, timeout=30)
        except Exception as error:
            logger.warning("uia2 uninstall failed for %s: %s", pkg, error)
    _uia2_whitelisted_udids.discard(udid)


_IOS_DEVICE_LOST_RETRIES = 3
_IOS_DEVICE_LOST_SIGNATURES = (
    "Unknown device or simulator UDID",
    "Failed to receive any data within the timeout",
    "Unable to launch WebDriverAgent",
    "xcodebuild failed with code 65",
)


def _is_ios_device_lost(error) -> bool:
    text = str(error)
    return any(sig in text for sig in _IOS_DEVICE_LOST_SIGNATURES)


def _wait_for_ios_device(udid, timeout=240) -> bool:
    """Poll until the phone is enumerable again. A WDA/xcodebuild death tears down the CoreDevice tunnel, so the device is briefly invisible and every new session fails with 'Unknown device or simulator UDID' — it re-establishes itself within a few minutes."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            listed = subprocess.run(["xcrun", "devicectl", "list", "devices"],
                                    capture_output=True, text=True, timeout=45)
            if udid and udid in (listed.stdout or ""):
                return True
            probe = subprocess.run(["idevice_id", "-l"], capture_output=True, text=True, timeout=20)
            if udid and udid in (probe.stdout or ""):
                return True
        except Exception as error:
            logger.debug("iOS device probe failed: %s", error)
        time.sleep(10)
    return False


@pytest.fixture(scope="session")
def device_reboot(request):
    """
    Session-scoped fixture to reboot the phone once per test session.
    Reboot is controlled via --reboot-device command line argument.
    Uses ADB for Android and idevicediagnostics for iOS; a failed or slow reboot
    only warns so the session still runs.
    """

    reboot_device = request.config.getoption("--reboot-device", "y")
    if reboot_device.lower() != "y":
        logger.info("Device reboot is disabled (use --reboot-device=y to enable)")
        return

    models = request.config.getoption("--model")
    if not models:
        return

    model = models.split(",")[0].strip()

    config_path = Path("config")
    try:
        with open(config_path / "app.yaml", 'r') as f:
            app_config = yaml.safe_load(f) or {}
        with open(config_path / "mobiles.yaml", 'r') as f:
            mobiles_config = yaml.safe_load(f) or {}
    except Exception as e:
        logger.error(f"Failed to load config files: {e}")
        return

    device_config = mobiles_config.get("mobiles", {}).get(model, {})
    platform = device_config.get("platform", "Android").lower()
    udid = device_config.get("udid")

    if platform == "android":
        rainmaker_home_config = app_config.get("rainmaker-home", {})
        android_path = rainmaker_home_config.get("android_path")
        adb_path = rainmaker_home_config.get("adb_path") or (
            f"{android_path.rstrip('/')}/platform-tools/adb" if android_path else "adb"
        )
        _reboot_android_device(adb_path, udid, model)
        adb_cmd = [adb_path] + (["-s", udid] if udid else [])
        _ensure_android_wifi_connected(adb_cmd, model)
    elif platform == "ios":
        _reboot_ios_device(udid, model)
    else:
        logger.warning(f"Unknown platform '{platform}' for {model}; skipping reboot")


@pytest.fixture(scope="session")
def app_installer(request, device_reboot):
    """
    Session-scoped fixture to install app once per test session.
    Installation is controlled via --install-app command line argument.
    Uses ADB directly for Android and ideviceinstaller for iOS (no Appium needed).
    """

    # Check if app installation is enabled via command line argument
    install_app = request.config.getoption("--install-app", "y")
    if install_app.lower() != "y":
        logger.info("App installation is disabled (use --install-app=y to enable)")
        yield
        return

    models = request.config.getoption("--model")
    if not models:
        yield
        return

    # Get the first model for this session
    model = models.split(",")[0].strip()
        
    # Load config to get app paths and device info
    config_path = Path("config")
    app_config_path = config_path / "app.yaml"
    mobiles_config_path = config_path / "mobiles.yaml"
    
    try:
        with open(app_config_path, 'r') as f:
            app_config = yaml.safe_load(f) or {}
        with open(mobiles_config_path, 'r') as f:
            mobiles_config = yaml.safe_load(f) or {}
    except Exception as e:
        logger.error(f"Failed to load config files: {e}")
        yield
        return
    
    rainmaker_home_config = app_config.get("rainmaker-home", {})
    device_config = mobiles_config.get("mobiles", {}).get(model, {})
    platform = device_config.get("platform", "Android").lower()
    udid = device_config.get("udid")
    repo_root = Path(__file__).resolve().parent
    
    try:
        if platform == "android":
            android_path = rainmaker_home_config.get("android_path")
            adb_path = rainmaker_home_config.get("adb_path") or (
                f"{android_path.rstrip('/')}/platform-tools/adb" if android_path else "adb"
            )
            apk_path = rainmaker_home_config.get("apk_path")
            package = rainmaker_home_config.get("package")
            if apk_path:
                apk_path = str((repo_root / apk_path).resolve()) if not os.path.isabs(apk_path) else apk_path
            
            # Uninstall first if exists, then install
            _uninstall_android_app(adb_path, udid, package, model)
            if not apk_path:
                pytest.fail("APK path not set in config/app.yaml")
            if not _install_android_app(adb_path, udid, apk_path, package, model):
                pytest.fail(f"Failed to install the Android app on {model}; the run would test the build already on the phone")
                
        elif platform == "ios":
            ipa_path = rainmaker_home_config.get("ipa_path")
            bundle_id = rainmaker_home_config.get("bundle_id")
            if ipa_path:
                ipa_path = str(Path(ipa_path).expanduser().resolve())
            
            # Uninstall first if exists, then install
            _uninstall_ios_app(udid, bundle_id, model)
            if not ipa_path:
                pytest.fail("IPA path not set in config/app.yaml")
            if not _install_ios_app(udid, ipa_path, bundle_id, model):
                pytest.fail(f"Failed to install the iOS app on {model}; the run would test the build already on the phone")
        else:
            logger.warning(f"Unsupported platform: {platform}")
            yield
            return
            
    except pytest.fail.Exception:
        raise
    except Exception as e:
        logger.error(f"Error during app installation for {model}: {e}")

    yield

@pytest.fixture(scope="function")
def driver(request, appium_grid, app_installer):
    """Single driver fixture optimized for parallel execution"""
    
    models = request.config.getoption("--model")
    
    if not models:
        pytest.skip("No device model specified. Use --model option.")
    
    # Get the first model for this test session
    model = models.split(",")[0].strip()
    
    # Ensure server is running for this model
    if not appium_grid.start_server(model):
        pytest.skip(f"Failed to start Appium server for {model}")
    
    # Get the server URL for this model
    try:
        server_url = appium_grid.get_server_url(model)
    except ValueError as e:
        pytest.skip(f"No server URL for {model}: {e}")
    
    # Build capabilities and create appropriate options object
    capabilities = appium_grid.get_capabilities_for_model(model)
    platform = capabilities.get("platformName", "Android").lower()
    
    driver_instance = None
    try:
        # Create appropriate options object based on platform
        if platform == "android":
            options = UiAutomator2Options()
            for key, value in capabilities.items():
                if hasattr(options, key.replace('_', '')):  # Handle snake_case to camelCase
                    setattr(options, key.replace('_', ''), value)
                else:
                    options.set_capability(key, value)
        elif platform == "ios":
            options = XCUITestOptions()
            for key, value in capabilities.items():
                if hasattr(options, key.replace('_', '')):  # Handle snake_case to camelCase
                    setattr(options, key.replace('_', ''), value)
                else:
                    options.set_capability(key, value)
        else:
            pytest.skip(f"Unsupported platform: {platform}")
        
        try:
            driver_instance = webdriver.Remote(server_url, options=options)
        except Exception as create_error:
            if platform == "android" and _is_uia2_crash(create_error):
                logger.warning("RETRY driver: uiautomator2 instrumentation wedged (%s); rebooting %s and retrying once",
                               create_error, model)
                _unwedge_android_uiautomator2(capabilities.get("udid"), model)
                driver_instance = webdriver.Remote(server_url, options=options)
            elif platform == "ios" and _is_ios_device_lost(create_error):
                driver_instance = None
                for attempt in range(_IOS_DEVICE_LOST_RETRIES):
                    logger.warning("RETRY driver (attempt %s/%s): iPhone not enumerable (%s); waiting for the CoreDevice tunnel to rebuild",
                                   attempt + 1, _IOS_DEVICE_LOST_RETRIES, create_error)
                    _wait_for_ios_device(capabilities.get("udid"))
                    try:
                        driver_instance = webdriver.Remote(server_url, options=options)
                        break
                    except Exception as retry_error:
                        create_error = retry_error
                        if not _is_ios_device_lost(retry_error):
                            raise
                if driver_instance is None:
                    raise create_error
            else:
                raise
        try:
            if platform == "android":
                _whitelist_uiautomator2(capabilities.get("udid"))
                driver_instance.update_settings({"waitForIdleTimeout": 200})
                logger.info("Android: waitForIdleTimeout=200")
            elif platform == "ios":
                driver_instance.update_settings({"animationCoolOffTimeout": 0})
                logger.info("iOS: animationCoolOffTimeout=0")
        except Exception as e:
            logger.warning(f"Failed to update driver settings: {e}")
        
        driver_instance._test_info = {
            "model": model,
            "platform": platform,
            "capabilities": capabilities,
            "server_url": server_url
        }
        
        yield driver_instance
        
    except Exception as e:
        pytest.skip(f"Failed to create driver for {model}: {e}")
    
    finally:
        # Cleanup driver
        if driver_instance:
            try:
                driver_instance.quit()
            except Exception:
                pass  # Ignore cleanup errors

def _expected_app_version_display() -> str:
    """Expected app version string as shown in UI (e.g. 'Version 3.5.0 (a1b2c3d)')."""
    from utils.common_utils import read_app_version, read_commit_id

    version = read_app_version()
    if not version:
        return "Version N/A"
    commit = read_commit_id()
    return f"Version {version} ({commit})" if commit else f"Version {version}"


@pytest.fixture(scope="session")
def expected_app_version():
    """Expected app version string for UI validation (perfect match)."""
    return _expected_app_version_display()


@pytest.fixture(autouse=True)
def per_test_debug_dir(request):
    """Per-test artifact folder: test/debug/YYYYMMDD_HHMMSS_<test_name>/."""
    from hardware.artifacts import TestArtifactDir

    existing = getattr(request.node, "_test_artifact_dir", None)
    if existing is not None:
        yield existing
        return

    debug_root = request.config.getoption("--debug-dir", "debug")
    artifact_dir = TestArtifactDir.for_test(request.node, debug_root=debug_root)
    request.node._test_artifact_dir = artifact_dir
    from utils.rainmaker_cloud import set_cloud_log_path
    set_cloud_log_path(artifact_dir.root / "cloud_api.jsonl")
    yield artifact_dir
    set_cloud_log_path(None)


@pytest.fixture(scope="function")
def helper(driver, per_test_debug_dir, request):
    """Page helper manager fixture providing access to all page helpers"""
    if not driver:
        pytest.skip("No driver available")
    page_helper = PageHelperManager(driver)
    page_helper._test_artifact_dir = per_test_debug_dir
    return page_helper

# Autouse fixtures for automatic screen recording
@pytest.fixture(autouse=True)
def auto_screen_recording(request, driver, per_test_debug_dir):
    """Automatically start screen recording for each test"""
    global debug_helper

    # Skip if no driver or recording disabled
    if not driver or not debug_helper or not request.config.getoption("--enable-recording"):
        yield
        return

    model = driver._test_info.get('model', 'unknown')

    # Start recording
    recording_id = debug_helper.start_screen_recording(driver, per_test_debug_dir)

    # Store recording info for cleanup
    if recording_id:
        setattr(request.node, '_recording_id', recording_id)
        logger.info(f"Started automatic recording for {request.node.name} on {model}")

    syslog_handle = debug_helper.start_ios_syslog(driver, per_test_debug_dir)
    if syslog_handle:
        setattr(request.node, '_ios_syslog', syslog_handle)

    yield  # Test runs here

@pytest.fixture(scope="function")
def config(request):
    """Provide test configuration data from YAML files"""
    import yaml
    from pathlib import Path
    
    # Get the test function name
    test_name = request.node.name
    
    # Try to find corresponding YAML file in the same directory as the test
    test_file_path = Path(request.fspath)
    test_dir = test_file_path.parent
    
    # Look for test_data.yaml in the test directory
    yaml_file = test_dir / "test_data.yaml"
    
    if yaml_file.exists():
        try:
            with open(yaml_file, 'r') as f:
                data = yaml.safe_load(f)
            
            # Return data for the specific test if it exists
            if test_name in data:
                return data[test_name]
            
            # Return the entire data if no specific test data found
            return data
        except Exception as e:
            logger.warning(f"Error loading test data from {yaml_file}: {e}")
            return {}
    
    # Return empty dict if no YAML file found
    logger.warning(f"No test_data.yaml found in {test_dir}")
    return {}

def _find_chip_serial_log_path(item) -> Optional[Path]:
    """Resolve chip UART log path from hardware session or artifact directory."""
    serial_path = getattr(item, "_chip_serial_log_path", None)
    if serial_path:
        return Path(serial_path)

    if not hasattr(item, "funcargs"):
        return None
    hardware_session = item.funcargs.get("hardware_session")
    if not hardware_session:
        return None
    resource = hardware_session.get("resource")
    if not resource:
        return None

    if resource.serial_log_path:
        return Path(resource.serial_log_path)

    artifact_dir = getattr(item, "_test_artifact_dir", None)
    if artifact_dir is not None:
        candidate = artifact_dir.serial_log_path(resource)
        if candidate.exists():
            return candidate
        chip = resource.chip_type.lower()
        mac = resource.mac_address.replace(":", "").lower()
        for pattern in (f"{chip}_{mac}.log", f"{chip}_*.log", "esp*.log"):
            matches = sorted(artifact_dir.root.glob(pattern))
            if matches:
                return matches[0]
    return None


def _attach_serial_log_to_report(item, report) -> None:
    """
    Attach the ESP chip serial log path to the test report.

    The report plugin resolves the hosted URL from debug_artifacts["serial_log"]
    (see PytestReportPlugin._resolve_artifact_url) — no URL handling here.
    """
    serial_path = _find_chip_serial_log_path(item)
    if not serial_path or not serial_path.exists() or serial_path.stat().st_size == 0:
        return

    report.debug_artifacts = getattr(report, "debug_artifacts", {})
    report.debug_artifacts["serial_log"] = str(serial_path)
    report.debug_artifacts["chip_serial_log_name"] = serial_path.name


def _attach_cloud_api_log_to_report(item, report) -> None:
    """The report plugin resolves the hosted URL from debug_artifacts["cloud_api_log"]."""
    artifact_dir = getattr(item, "_test_artifact_dir", None)
    if artifact_dir is None:
        return
    path = artifact_dir.root / "cloud_api.jsonl"
    if not path.exists() or path.stat().st_size == 0:
        return
    report.debug_artifacts = getattr(report, "debug_artifacts", {})
    report.debug_artifacts["cloud_api_log"] = str(path)


# Test execution hooks with automatic debug capabilities
@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """Generate test report with automatic debug artifacts on failure"""
    global debug_helper
    
    outcome = yield
    report = outcome.get_result()
    
    # Mark hardware allocation failed
    if call.when == "call" and report.outcome in ("failed", "error") and hasattr(item, "funcargs"):
        hardware_session = item.funcargs.get("hardware_session")
        if hardware_session is not None:
            hardware_session["failed"] = True
            if hasattr(report, "longrepr") and report.longrepr:
                hardware_session["error"] = str(report.longrepr)[:500]

    # Save screen recording for every outcome so passing tests get a video link too.
    # Also runs on setup failure so an already-started recorder is not orphaned.
    stop_recording = call.when == "call" or (call.when == "setup" and report.outcome != "passed")
    if stop_recording and debug_helper and hasattr(item, 'funcargs'):
        driver = item.funcargs.get('driver')
        recording_id = getattr(item, '_recording_id', None)
        if driver and recording_id:
            item._recording_id = None  # consumed; avoid double stop in failure capture
            video_path = debug_helper.stop_screen_recording(
                driver, recording_id, getattr(item, "_test_artifact_dir", None)
            )
            if video_path:
                report.video_path = video_path
                report.debug_artifacts = getattr(report, "debug_artifacts", {})
                report.debug_artifacts["video"] = video_path
        syslog_handle = getattr(item, '_ios_syslog', None)
        if syslog_handle:
            item._ios_syslog = None
            debug_helper.stop_ios_syslog(syslog_handle)

    # Handle test failure - automatically capture debug artifacts
    if call.when == "call" and report.outcome == "failed" and debug_helper:
        if hasattr(item, 'funcargs'):
            # Single driver tests
            if 'driver' in item.funcargs and item.funcargs['driver']:
                driver = item.funcargs['driver']
                test_name = item.name
                artifact_dir = getattr(item, "_test_artifact_dir", None)
                
                # Get run_id and artifact_host from report plugin if available
                run_id = None
                artifact_host = None
                if REPORT_PLUGIN_AVAILABLE:
                    try:
                        plugin = item.config.pluginmanager.get_plugin("pytest_report_plugin")
                        if plugin:
                            if hasattr(plugin, 'run_id'):
                                run_id = plugin.run_id
                            if hasattr(plugin, 'artifact_host') and plugin.artifact_host:
                                artifact_host = plugin.artifact_host
                                # Update debug_helper's artifact_host to use the plugin's instance
                                if debug_helper and hasattr(debug_helper, '_artifact_host'):
                                    debug_helper._artifact_host = artifact_host
                                    debug_helper.use_artifact_host = True
                    except Exception as e:
                        logger.warning(f"Error getting run_id / artifact_host from pytest_report_plugin: {e}")
                
                artifacts = debug_helper.capture_all_artifacts(
                    driver, artifact_dir, run_id
                )

                # Add artifacts to report for HTML display
                if artifacts.get('screenshot_b64'):
                    report.screenshot_b64 = artifacts['screenshot_b64']

                if artifacts:
                    report.debug_artifacts = {**getattr(report, "debug_artifacts", {}), **artifacts}
                    logger.info(f"Debug artifacts captured for {test_name}: {list(artifacts.keys())}")

                if hasattr(report, 'sections'):
                    # Store sections for later extraction
                    report._test_sections = report.sections

    if call.when == "call" or (call.when == "setup" and report.outcome == "failed"):
        _attach_serial_log_to_report(item, report)
        _attach_cloud_api_log_to_report(item, report)
    if call.when == "call":
        hardware_session = item.funcargs.get("hardware_session") if hasattr(item, "funcargs") else None
        if hardware_session and hardware_session.get("build_metadata"):
            from hardware.manager import get_hardware_report_for_session

            hw_store = get_hardware_report_for_session(item.session)
            report.hardware_info = hw_store.get(item.nodeid, [])

    # Store device info for HTML report
    if hasattr(item, 'funcargs'):
        if 'driver' in item.funcargs and item.funcargs['driver']:
            driver = item.funcargs['driver']
            report._device_info = driver._test_info


@pytest.hookimpl(optionalhook=True)
def pytest_html_results_table_header(cells):
    """Add custom columns to HTML report"""
    cells.insert(2, '<th class="sortable" data-column-type="text">Device</th>')
    cells.insert(3, '<th class="sortable" data-column-type="text">Platform</th>')
    cells.append('<th class="sortable" data-column-type="text">Screenshot</th>')
    cells.append('<th class="sortable" data-column-type="text">Video</th>')

@pytest.hookimpl(optionalhook=True)
def pytest_html_results_table_row(report, cells):
    """Add custom data to HTML report rows"""
    device_info = getattr(report, '_device_info', {'model': 'N/A', 'platform': 'N/A'})
    cells.insert(2, f'<td>{device_info.get("model", "N/A")}</td>')
    cells.insert(3, f'<td>{device_info.get("platform", "N/A")}</td>')
    
    # Add screenshot
    if hasattr(report, 'screenshot_b64'):
        screenshot_html = f'<img src="data:image/png;base64,{report.screenshot_b64}" alt="screenshot" style="width:200px;height:auto;" onclick="window.open(this.src)">'
        cells.append(f'<td>{screenshot_html}</td>')
    else:
        cells.append('<td>N/A</td>')
    
    # Add video link
    if hasattr(report, 'video_path'):
        video_name = os.path.basename(report.video_path)
        video_html = f'<a href="{report.video_path}" target="_blank">{video_name}</a>'
        cells.append(f'<td>{video_html}</td>')
    else:
        cells.append('<td>N/A</td>') 
