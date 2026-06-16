# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Debug utilities for capturing test artifacts on failure
"""
import os
import time
import base64
import logging
import subprocess
from pathlib import Path

from hardware.artifacts import TestArtifactDir, timestamped_test_folder_name
from utils.common_utils import safe_test_name
from typing import Optional, Dict

logger = logging.getLogger(__name__)

# Import artifact host (optional, to avoid circular imports)
try:
    from utils.artifact_host import get_artifact_host
    ARTIFACT_HOST_AVAILABLE = True
except ImportError:
    ARTIFACT_HOST_AVAILABLE = False
    logger.warning("Artifact host not available")

class DebugHelper:
    def __init__(self, debug_dir: str = "debug", use_artifact_host: bool = True, artifact_host=None):
        self.debug_dir = Path(debug_dir)
        self.debug_dir.mkdir(exist_ok=True)
        self.use_artifact_host = use_artifact_host and ARTIFACT_HOST_AVAILABLE
        self._artifact_host = artifact_host
        if self.use_artifact_host and not self._artifact_host:
            try:
                self._artifact_host = get_artifact_host()
            except Exception as e:
                logger.warning(f"Could not initialize artifact host: {e}")
                self.use_artifact_host = False
    

    def _resolve_output_dir(
        self, artifact_dir: TestArtifactDir
    ) -> Path:
        """
        Resolve where failure artifacts are written.

        Prefer the per-test artifact_dir from pytest; fall back to debug_dir.
        """
        root = getattr(artifact_dir, "root", artifact_dir) or self.debug_dir
        output_dir = Path(root)
        output_dir.mkdir(parents=True, exist_ok=True)
        return output_dir
        
    def capture_screenshot(
        self, driver, artifact_dir: TestArtifactDir
    ) -> Optional[str]:
        """Capture screenshot and return file path"""
        try:
            model = getattr(driver, '_test_info', {}).get('model', 'unknown')
            
            test_debug_dir = self._resolve_output_dir(artifact_dir)
            screenshot_path = test_debug_dir / f"screenshot_{model}.png"
            
            driver.save_screenshot(str(screenshot_path))
            logger.info(f"Screenshot saved: {os.path.abspath(screenshot_path)}")
            return os.path.abspath(screenshot_path)
            
        except Exception as e:
            logger.error(f"Failed to capture screenshot: {e}")
            return None
    
    def capture_page_source(
        self, driver, artifact_dir: TestArtifactDir
    ) -> Optional[str]:
        """Capture page XML dump"""
        try:
            model = getattr(driver, '_test_info', {}).get('model', 'unknown')
            platform = getattr(driver, '_test_info', {}).get('platform', 'unknown')
            
            test_debug_dir = self._resolve_output_dir(artifact_dir)
            xml_path = test_debug_dir / f"page_source_{model}.xml"
            
            # Get page source with timeout
            page_source = driver.page_source
            
            if not page_source or page_source.strip() == "":
                logger.warning("Page source is empty or None")
                return None
            
            # Save with proper encoding
            with open(xml_path, 'w', encoding='utf-8', errors='replace') as f:
                f.write(f"<!-- Platform: {platform}, Model: {model} -->\n")
                f.write(page_source)
            
            file_size = os.path.getsize(xml_path)
            logger.info(f"Page source saved: {xml_path} ({file_size} bytes)")
            return os.path.abspath(xml_path)
            
        except Exception as e:
            logger.error(f"Failed to capture page source: {e}")
            return None
    
    def start_screen_recording(self, driver, artifact_dir: TestArtifactDir) -> Optional[str]:
        """Start screen recording"""
        try:
            model = getattr(driver, '_test_info', {}).get('model', 'unknown')
            platform = getattr(driver, '_test_info', {}).get('platform', 'android')
            safe_name = safe_test_name(artifact_dir.name, max_len=120)
            
            if platform.lower() == 'android':
                # Android screen recording options
                options = {
                    'videoSize': '1280x720',
                    'timeLimit': '600',  # 10 minutes max
                    'bitRate': '4000000'  # 4 Mbps
                }
                driver.start_recording_screen(**options)
                logger.info(f"Android screen recording started for {model}")
                return f"recording_{safe_name}_{model}"
            elif platform.lower() == 'ios':
                options = {
                    'videoType': 'h264',
                    'videoQuality': 'medium',
                    'timeLimit': '600'  # 10 minutes max
                }
                driver.start_recording_screen(**options)
                logger.info(f"iOS screen recording started for {model}")
                return f"recording_{safe_name}_{model}"
            else:
                logger.warning(f"Screen recording not supported for platform: {platform}")
                return None
                
        except Exception as e:
            logger.error(f"Failed to start screen recording: {e}")
            return None
    
    def stop_screen_recording(
        self,
        driver,
        recording_id: str,
        artifact_dir: TestArtifactDir,
    ) -> Optional[str]:
        """Stop screen recording and save file"""
        try:
            if not recording_id:
                return None
            
            test_debug_dir = self._resolve_output_dir(artifact_dir)
            video_path = test_debug_dir / f"recording.mp4"
            
            video_data = driver.stop_recording_screen()
            video_bytes = base64.b64decode(video_data)
            
            with open(video_path, 'wb') as f:
                f.write(video_bytes)
            
            logger.info(f"Screen recording saved: {video_path}")
            return str(video_path)
            
        except Exception as e:
            logger.error(f"Failed to stop screen recording: {e}")
            return None
    
    def capture_adb_logs(
        self, driver, artifact_dir: TestArtifactDir
    ) -> Optional[str]:
        """
        Capture app-relevant ADB logcat logs (filtered by package / last N lines).
        """
        try:
            model = getattr(driver, '_test_info', {}).get('model', 'unknown')
            platform = getattr(driver, '_test_info', {}).get('platform', 'unknown')

            if platform.lower() != 'android':
                return None

            log_path = artifact_dir.android_logcat_log()
            
            udid = driver.capabilities.get('udid')
            adb_prefix = ['adb', '-s', udid] if udid else ['adb']

            package = driver.capabilities.get('appPackage', 'com.espressif.novahome')

            # Try app-filtered logs first: get PID and filter by --pid
            content = ""
            pid = None
            try:
                pid_cmd = adb_prefix + ['shell', 'pidof', '-s', package]
                pid_result = subprocess.run(pid_cmd, capture_output=True, text=True, timeout=5)
                pid = (pid_result.stdout or '').strip() if pid_result.returncode == 0 else None
                if pid:
                    logcat_cmd = adb_prefix + ['logcat', '-d', '--pid', pid]
                    result = subprocess.run(logcat_cmd, capture_output=True, text=True, timeout=30)
                    content = result.stdout or ''
            except Exception:
                pass

            # Fallback when app has exited (crash): last 8000 lines
            if not content:
                logcat_cmd = adb_prefix + ['logcat', '-d', '-t', '8000']
                result = subprocess.run(logcat_cmd, capture_output=True, text=True, timeout=30)
                content = result.stdout or ""

            with open(log_path, 'w', encoding='utf-8') as f:
                f.write(content)

            logger.info("ADB logs saved: %s", log_path)
            return str(log_path)

        except Exception as e:
            logger.error("Failed to capture ADB logs: %s", e)
            return None
    
    def capture_all_artifacts(
        self,
        driver,
        artifact_dir: TestArtifactDir,
        run_id: str = None,
    ) -> dict:
        """
        Capture failure artifacts: screenshot, page source, ADB logs.

        Screen recordings are stopped per-outcome in conftest
        pytest_runtest_makereport, not here.
        """
        artifacts = {}
        artifact_paths = {}
        
        # Screenshot
        screenshot_path = self.capture_screenshot(
            driver, artifact_dir
        )
        if screenshot_path:
            artifacts['screenshot'] = screenshot_path
            artifact_paths['screenshot'] = screenshot_path
            
            # Get base64 from the same screenshot file
            try:
                with open(screenshot_path, 'rb') as f:
                    screenshot_b64 = base64.b64encode(f.read()).decode()
                    artifacts['screenshot_b64'] = screenshot_b64
            except Exception as e:
                logger.error(f"Failed to encode screenshot to base64: {e}")
        
        # Page source/XML dump
        xml_path = self.capture_page_source(
            driver, artifact_dir
        )
        if xml_path:
            artifacts['page_source'] = xml_path
            artifact_paths['page_source'] = xml_path
        
        # ADB logs
        adb_logs_path = self.capture_adb_logs(
            driver, artifact_dir
        )
        if adb_logs_path:
            artifacts['adb_logs'] = adb_logs_path
            artifact_paths['log'] = adb_logs_path
        
        # Organize artifacts using artifact host if available
        if self.use_artifact_host and self._artifact_host and artifact_paths:
            try:
                if run_id:
                    self._artifact_host.current_run_id = run_id
                
                organized = self._artifact_host.organize_all_artifacts(
                    artifact_paths, artifact_dir.name, run_id
                )
                
                for artifact_type, org_data in organized.items():
                    url = org_data.get('url')
                    local_path = org_data.get('local_path')
                    if url:
                        if artifact_type == 'log':
                            artifacts['log_url'] = url
                            if 'adb_logs' in artifacts:
                                artifacts['adb_logs_url'] = url
                        artifacts[f'{artifact_type}_url'] = url
                    if local_path:
                        artifacts[f'{artifact_type}_organized_path'] = local_path
            except Exception as e:
                logger.error(f"Failed to organize artifacts: {e}", exc_info=True)
        
        return artifacts
