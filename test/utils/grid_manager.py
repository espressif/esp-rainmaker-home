# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Appium 2 Grid Manager - Standalone Server Architecture
"""
import subprocess
import time
import requests
import logging
import signal
import os
import socket
from pathlib import Path
from typing import Dict, Optional
import yaml

logger = logging.getLogger(__name__)

class AppiumGridManager:
    # Most-recently-created grid, so out-of-fixture code (e.g. the report plugin)
    # can reach it via this unambiguous module instead of `import conftest`
    # (which resolves to the nearest subdir conftest and lacks grid_manager).
    active_instance = None

    def __init__(self, config_path: str = "config", base_port: int = 4444, debug_dir: str = "debug"):
        self.config_path = Path(config_path)
        self.debug_dir = Path(debug_dir)
        self.debug_dir.mkdir(exist_ok=True)

        self.base_port = base_port
        self.servers = {}  # Track individual Appium servers per device
        AppiumGridManager.active_instance = self
        
        # Load configurations
        self.mobiles_config = self._load_config("mobiles.yaml")
        self.app_config = self._load_config("app.yaml")
        self.esp_devices_config = self._load_config("esp_devices.yaml")
        
    def _load_config(self, config_file: str) -> Dict:
        """Load configuration from YAML file"""
        config_path = self.config_path / config_file
        try:
            with open(config_path, 'r') as file:
                return yaml.safe_load(file) or {}
        except FileNotFoundError:
            logger.warning(f"Configuration file not found: {config_path}")
            return {}
        except Exception as e:
            logger.error(f"Error loading {config_path}: {e}")
            return {}
    
    def _find_available_port(self, start_port: int) -> int:
        """Find a truly free port. A connect() probe detects listeners."""
        port = start_port
        max_attempts = 100

        for attempt in range(max_attempts):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
                probe.settimeout(0.5)
                in_use = probe.connect_ex(('127.0.0.1', port)) == 0
            if not in_use:
                try:
                    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                        s.bind(('', port))
                        return port
                except OSError:
                    pass
            port += 1

        raise RuntimeError(f"No available ports found after {max_attempts} attempts starting from {start_port}")
    
    def _get_platform_from_model(self, model: str) -> str:
        """Auto-detect platform from model"""
        if model not in self.mobiles_config.get("mobiles", {}):
            available_models = list(self.mobiles_config.get("mobiles", {}).keys())
            raise ValueError(f"Model {model} not found. Available models: {available_models}")
        
        return self.mobiles_config["mobiles"][model].get("platform", "Android").lower()
    
    def _get_environment_variables(self) -> Dict[str, str]:
        """Get environment variables for Appium server"""
        env = os.environ.copy()
        rainmaker_home_config = self.app_config.get("rainmaker-home", {})
        
        # Set Android SDK environment variables
        android_path = rainmaker_home_config.get("android_path")
        if android_path and os.path.exists(android_path):
            env["ANDROID_HOME"] = android_path
            env["PATH"] = f"{android_path}/platform-tools:{android_path}/tools:{env.get('PATH', '')}"
            logger.info(f"Set ANDROID_HOME to: {android_path}")
        else:
            logger.warning(f"Android SDK path not found or not configured: {android_path}")
        
        # Set Java environment variables
        java_path = rainmaker_home_config.get("java_path")
        if java_path and os.path.exists(java_path):
            env["JAVA_HOME"] = java_path
            env["PATH"] = f"{java_path}/bin:{env.get('PATH', '')}"
            logger.info(f"Set JAVA_HOME to: {java_path}")
        
        return env

    def get_capabilities_for_model(self, model: str, **kwargs) -> Dict:
        """Build capabilities for specific device model"""
        if model not in self.mobiles_config.get("mobiles", {}):
            raise ValueError(f"Model {model} not found in mobiles.yaml")
        
        device_config = self.mobiles_config["mobiles"][model]
        platform = device_config.get("platform", "Android").lower()
        
        if platform == "android":
            return self._get_android_capabilities(model, device_config, **kwargs)
        elif platform == "ios":
            return self._get_ios_capabilities(model, device_config, **kwargs)
        else:
            raise ValueError(f"Unsupported platform: {platform}")
    
    def _get_android_capabilities(self, model: str, mobile_config: Dict, **kwargs) -> Dict:
        """Build Android capabilities"""
        rainmaker_home_config = self.app_config.get("rainmaker-home", {})
        
        capabilities = {
            "platformName": "Android",
            "platformVersion": str(mobile_config.get("version", "12")),
            "deviceName": mobile_config.get("model", model),
            "udid": mobile_config.get("udid"),
            "automationName": "UiAutomator2",
            "appPackage": rainmaker_home_config.get("package", "com.espressif.novahome"),
            "appActivity": rainmaker_home_config.get("activity"),
            "autoGrantPermissions": True,
            "newCommandTimeout": 3600,
            "systemPort": self._find_available_port(8200),
            "disableIdLocatorAutocompletion": True,
            "shouldUseCompactResponses": False
        }
        
        # Add app if available
        # app_path = rainmaker_home_config.get("apk_path")
        # if app_path and os.path.exists(app_path):
        #     capabilities["app"] = app_path
        
        capabilities.update(kwargs)
        return capabilities
    
    def _get_ios_capabilities(self, model: str, mobile_config: Dict, **kwargs) -> Dict:
        """Build iOS capabilities"""
        rainmaker_home_config = self.app_config.get("rainmaker-home", {})
        
        capabilities = {
            "platformName": "iOS",
            "platformVersion": mobile_config.get("platform_version", "16.0"),
            "deviceName": mobile_config.get("device_name", model),
            "udid": mobile_config.get("udid"),
            "automationName": "XCUITest",
            "bundleId": rainmaker_home_config.get("bundle_id", "com.espressif.nova"),
            "wdaLocalPort": self._find_available_port(8100),
            "xcodeOrgId": rainmaker_home_config.get("xcode_org_id"),
            "xcodeSigningId": rainmaker_home_config.get("xcode_signing_id"),
            "updatedWDABundleId": rainmaker_home_config.get("updated_wda_bundle_id"),
            "shouldTerminateApp": True,
            "includeSafariInWebviews": True,
            "wdaEventloopIdleDelay": 1,
            "newCommandTimeout": 0,
            "useNewWDA": False,
            "wdaStartupRetries": 3,
            "wdaStartupRetryInterval": 10000,
            "clearSystemFiles": True,
            "skipLogCapture": False,
            "waitForIdleTimeout": 0,
            "reduceMotion": True,
            "maxTypingFrequency": 30
        }
        # Add app if available
        # app_path = rainmaker_home_config.get("ipa_path")
        # if app_path and os.path.exists(app_path):
        #     capabilities["app"] = app_path

        capabilities.update(kwargs)
        return capabilities

    def _is_server_running(self, port: int) -> bool:
        """Check if Appium server is running on port"""
        try:
            response = requests.get(f"http://localhost:{port}/status", timeout=5)
            return response.status_code == 200
        except requests.exceptions.RequestException:
            return False
    
    def start_server(self, model: str) -> bool:
        """Start dedicated Appium server for device model"""
        platform = self._get_platform_from_model(model)
        server_id = f"{model}_{platform}"  # Remove timestamp for consistent server tracking
        
        if server_id in self.servers and self._is_server_running(self.servers[server_id]["port"]):
            logger.info(f"Appium server for {model} already running")
            return True
        
        # Find available port
        server_port = self._find_available_port(self.base_port)
        
        # Create log file
        from datetime import datetime
        timestamp = datetime.now().strftime("%H%M%S_%d%m%Y")
        log_file = self.debug_dir / f"appium_{server_id}_{timestamp}.log"
        log_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Get environment variables with Android SDK paths
        env = self._get_environment_variables()
        
        # Start Appium server
        command = [
            "appium", "server",
            "--port", str(server_port),
            "--log", str(log_file),
            "--local-timezone"
        ]
        
        try:
            with open(log_file, 'w') as f:
                process = subprocess.Popen(
                    command,
                    stdout=f,
                    stderr=subprocess.STDOUT,
                    env=env,
                    preexec_fn=os.setsid if os.name != 'nt' else None
                )
            
            self.servers[server_id] = {
                "process": process,
                "port": server_port,
                "model": model,
                "platform": platform,
                "url": f"http://localhost:{server_port}",
                "log_file": str(log_file)
            }
            
            # Wait for server to start
            for i in range(30):
                if process.poll() is not None:
                    logger.error(
                        f"Appium server process for {model} exited (rc={process.returncode}) "
                        f"before becoming ready — see {log_file}"
                    )
                    self.servers.pop(server_id, None)
                    return False
                if self._is_server_running(server_port):
                    logger.info(f"Appium server started for {model} on port {server_port}")
                    return True
                time.sleep(1)

            logger.error(f"Failed to start Appium server for {model}")
            return False
            
        except Exception as e:
            logger.error(f"Error starting Appium server for {model}: {e}")
            return False
    
    def get_server_url(self, model: str) -> str:
        """Get server URL for device model"""
        platform = self._get_platform_from_model(model)
        server_id = f"{model}_{platform}"
        
        if server_id in self.servers:
            return self.servers[server_id]["url"]
        else:
            raise ValueError(f"No server running for {model}")
    
    def stop_server(self, model: str):
        """Stop Appium server for model"""
        platform = self._get_platform_from_model(model)
        server_id = f"{model}_{platform}"
        
        if server_id in self.servers:
            try:
                process = self.servers[server_id]["process"]
                
                if os.name != 'nt':
                    os.killpg(os.getpgid(process.pid), signal.SIGTERM)
                else:
                    process.terminate()
                
                process.wait(timeout=10)
                logger.info(f"Stopped Appium server for {model}")
                
            except Exception as e:
                logger.error(f"Error stopping server for {model}: {e}")
            finally:
                del self.servers[server_id]
    
    def cleanup(self):
        """Stop all Appium servers"""
        for server_id in list(self.servers.keys()):
            try:
                model = self.servers[server_id]["model"]
                self.stop_server(model)
            except Exception as e:
                logger.error(f"Error stopping server {server_id}: {e}")
    
    def get_status(self) -> Dict:
        """Get status of all servers"""
        running_servers = []
        for server_id, info in self.servers.items():
            if self._is_server_running(info["port"]):
                running_servers.append({
                    "model": info["model"],
                    "port": info["port"],
                    "url": info["url"]
                })
        
        return {
            "ready": len(running_servers) > 0,
            "servers": running_servers,
            "count": len(running_servers)
        }
