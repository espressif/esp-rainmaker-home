# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Main conftest.py with Appium 2 standalone server support
"""
import pytest
from pytest_bdd import when, given, then, parsers
import yaml
import sys
import logging
import atexit
import os
import subprocess
from pathlib import Path
from typing import Optional
# Logging is captured by pytest itself (see pytest.ini: log_level / log_format).
# We deliberately do NOT add a root StreamHandler here — it would also emit every
# record to stderr, which pytest captures separately, duplicating each log line
# (in a second format) in the per-test report logs.
logger = logging.getLogger(__name__)

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

    def create_users(count: int = 1, user_password: Optional[str] = None):
        nonlocal users
        logger.info("Creating %s registered user(s) via API for %s/%s", count, deployment, model)
        # Create via API first (slow network), then persist under the lock so the
        # brief read-modify-write doesn't block concurrent runs the whole time.
        created = [helper.create_and_confirm_user(user_password or password) for _ in range(count)]
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

    # Release every chip the test acquired (fall back to the single slot).
    resources = session.get("resources") or ([session["resource"]] if session.get("resource") else [])
    if any(r.qr_payload for r in resources):
        from hardware.qr import QrDisplay

        QrDisplay.close()  # never leave the QR preview behind on failures
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


@when(parsers.parse('user login with "{email}" and "{password}"'))
@given(parsers.parse('user login with "{email}" and "{password}"'))
def login_with_credentials(
    helper,
    email,
    password,
    registered_user_resolver,
    registered_user_password_resolver,
):
    email = registered_user_resolver(email)
    resolved_password = registered_user_password_resolver(password)
    helper.login.perform_login(email, resolved_password)
    helper.login.last_login_email = email


@given("the app is launched")
def app_launched(helper):
    assert helper.driver is not None

@given("user should land on the home screen")
@then("user should land on the home screen")
def land_on_home_page(helper):
    assert helper.home.check_screen_displayed(), "Should be on home screen"

@given("user should be on login screen")
def given_login_screen(helper):
    """Ensure app is on login screen. If user is logged in (e.g. iOS persists session), logout first."""
    helper.login.ensure_login_screen()


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
    parser.addoption("--deployment", action="store", default="production", help="Deployment name in config/deployment.yaml")


def pytest_configure(config):
    """Configure pytest with Appium servers"""
    global grid_manager, debug_helper
    
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
    
    # Register cleanup
    atexit.register(cleanup_servers)
    
    # Register custom markers
    config.addinivalue_line("markers", "multiple_devices: mark test to run on multiple devices")
    config.addinivalue_line("markers", "sanity: mark test as sanity test")
    config.addinivalue_line("markers", "smoke: mark test as smoke test")
    config.addinivalue_line("markers", "regression: mark test as regression test")
    config.addinivalue_line("markers", "user_management: mark test as user management test")
    config.addinivalue_line("markers", "provisioning: mark tests ESP provisioning test")

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
        result = subprocess.run(idevice_cmd + ["-l"], capture_output=True, text=True, timeout=10)
        if result.returncode == 0 and bundle_id in result.stdout:
            uninstall_result = subprocess.run(
                idevice_cmd + ["-U", bundle_id], capture_output=True, text=True, timeout=60
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

        # Fallback: ideviceinstaller (libimobiledevice)
        idevice_cmd = ["ideviceinstaller"] + (["-u", udid] if udid else [])
        install_result = subprocess.run(
            idevice_cmd + ["-i", ipa_path], capture_output=True, text=True, timeout=120
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


@pytest.fixture(scope="session")
def app_installer(request):
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
                logger.error(f"Failed to install Android app on {model}")
                
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
                logger.error(f"Failed to install iOS app on {model}")
        else:
            logger.warning(f"Unsupported platform: {platform}")
            yield
            return
            
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
        
        driver_instance = webdriver.Remote(server_url, options=options)
        try:
            if platform == "android":
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
    """Expected app version string as shown in UI (e.g. 'Version 3.5.0')."""
    from utils.common_utils import read_app_version

    version = read_app_version()
    return f"Version {version}" if version else "Version N/A"


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
    yield artifact_dir


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

    if call.when == "call":
        _attach_serial_log_to_report(item, report)
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
