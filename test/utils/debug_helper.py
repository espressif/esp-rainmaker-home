# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Debug utilities for capturing test artifacts on failure
"""
import os
import re
import time
import base64
import logging
import shutil
import subprocess
import tempfile
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
        self._attached_crash_reports = set()
        self._recording_started = {}
        self._session_start = time.time()
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
                    'timeLimit': '600',  # 10 minutes max
                }
                driver.start_recording_screen(**options)
                self._recording_started[f"recording_{safe_name}_{model}"] = time.monotonic()
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

            started = self._recording_started.pop(recording_id, None)
            if started is not None:
                self._retime_video_to_wallclock(video_path, time.monotonic() - started)

            logger.info(f"Screen recording saved: {video_path}")
            return str(video_path)
            
        except Exception as e:
            logger.error(f"Failed to stop screen recording: {e}")
            return None

    def _retime_video_to_wallclock(self, video_path, wall_seconds):
        """Re-stretch the video's PTS so playback duration matches the real recording time.
        WDA tags the iOS capture at a higher container fps than it actually captured, so the
        raw file plays fast; this makes 1s of video == 1s of the test."""
        ffmpeg = shutil.which("ffmpeg")
        ffprobe = shutil.which("ffprobe")
        if not ffmpeg or not ffprobe or wall_seconds < 1:
            return
        try:
            raw_dur = float(subprocess.run(
                [ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video_path)],
                capture_output=True, text=True, timeout=30).stdout.strip() or 0)
            if raw_dur < 0.5 or abs(raw_dur - wall_seconds) < 1.5:
                return
            factor = wall_seconds / raw_dur
            tmp = str(video_path) + ".retime.mp4"
            result = subprocess.run(
                [ffmpeg, "-y", "-i", str(video_path), "-filter:v", f"setpts={factor:.4f}*PTS",
                 "-an", "-r", "15", tmp],
                capture_output=True, text=True, timeout=180)
            if result.returncode == 0 and os.path.exists(tmp) and os.path.getsize(tmp) > 0:
                os.replace(tmp, str(video_path))
                logger.info("Re-timed video %.0fs -> %.0fs (x%.2f)", raw_dur, wall_seconds, factor)
            else:
                logger.warning("Video re-time failed (rc=%s); keeping original", result.returncode)
                if os.path.exists(tmp):
                    os.remove(tmp)
        except Exception as error:
            logger.warning("Video re-time error: %s", error)
    
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
                ios_log = artifact_dir.ios_syslog_log()
                return str(ios_log) if ios_log.exists() and ios_log.stat().st_size > 0 else None

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
    
    def start_ios_syslog(self, driver, artifact_dir: TestArtifactDir):
        """Stream the iPhone's syslog to a file for the test's duration (iOS only; idevicesyslog)."""
        try:
            if getattr(driver, '_test_info', {}).get('platform', '').lower() != 'ios':
                return None
            udid = driver.capabilities.get('udid')
            process = getattr(driver, '_test_info', {}).get('capabilities', {}).get('iosLogProcess', 'APP')
            log_file = open(artifact_dir.ios_syslog_log(), 'w', encoding='utf-8')
            try:
                cmd = ['idevicesyslog'] + (['-u', udid] if udid else []) + ['-p', process]
                proc = subprocess.Popen(cmd, stdout=log_file, stderr=subprocess.STDOUT)
            except Exception:
                log_file.close()
                raise
            return {'proc': proc, 'file': log_file}
        except Exception as e:
            logger.warning("Failed to start iOS syslog stream: %s", e)
            return None

    def stop_ios_syslog(self, handle) -> None:
        """Stop an iOS syslog stream started by start_ios_syslog and flush its file."""
        if not handle:
            return
        try:
            handle['proc'].terminate()
            try:
                handle['proc'].wait(timeout=5)
            except Exception:
                handle['proc'].kill()
        except Exception as e:
            logger.warning("Failed to stop iOS syslog stream: %s", e)
        finally:
            try:
                handle['file'].flush()
                handle['file'].close()
            except Exception:
                pass

    def collect_ios_crash_reports(self, driver, artifact_dir: TestArtifactDir) -> Optional[str]:
        """Pull iOS app crash reports (.ips) into one aggregated log for this test.

        iOS only. Keeps reports on the device (-k, no state change) and filters to
        the app process (-f APP). Dedupes by report filename across the run so the
        same crash is not attached to multiple tests. Never raises.
        """
        try:
            if getattr(driver, '_test_info', {}).get('platform', '').lower() != 'ios':
                return None
            udid = driver.capabilities.get('udid')
            tmp = tempfile.mkdtemp(prefix='ios_crash_')
            try:
                cmd = ['idevicecrashreport', '-k', '-f', 'APP'] + (['-u', udid] if udid else []) + [tmp]
                subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
                fresh = []
                for base, _dirs, files in os.walk(tmp):
                    for fn in files:
                        if not fn.lower().endswith(('.ips', '.crash')):
                            continue
                        if fn in self._attached_crash_reports:
                            continue
                        m = re.search(r'-(\d{4})-(\d{2})-(\d{2})-(\d{6})\.', fn)
                        if m:
                            try:
                                crash_ts = time.mktime(time.strptime("-".join(m.groups()), "%Y-%m-%d-%H%M%S"))
                                if crash_ts < self._session_start - 1800:
                                    continue
                            except Exception:
                                pass
                        self._attached_crash_reports.add(fn)
                        fresh.append(os.path.join(base, fn))
                if not fresh:
                    return None
                out_path = artifact_dir.ios_crash_log()
                with open(out_path, 'w', encoding='utf-8') as out:
                    for fp in sorted(fresh):
                        out.write(f"===== {os.path.basename(fp)} =====\n")
                        try:
                            with open(fp, 'r', encoding='utf-8', errors='replace') as f:
                                out.write(f.read())
                        except Exception:
                            pass
                        out.write("\n\n")
                return str(out_path)
            finally:
                shutil.rmtree(tmp, ignore_errors=True)
        except Exception as e:
            logger.warning("Failed to collect iOS crash reports: %s", e)
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
        
        # Device logs (Android logcat / iOS syslog)
        device_log_path = self.capture_adb_logs(
            driver, artifact_dir
        )
        if device_log_path:
            is_android = getattr(driver, '_test_info', {}).get('platform', '').lower() == 'android'
            artifacts['adb_logs' if is_android else 'ios_syslog'] = device_log_path
            artifact_paths['log'] = device_log_path

        # iOS app crash reports (.ips) captured during this test, if any
        crash_log_path = self.collect_ios_crash_reports(driver, artifact_dir)
        if crash_log_path:
            artifacts['ios_crash'] = crash_log_path
            artifact_paths['crash'] = crash_log_path

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
                            if 'ios_syslog' in artifacts:
                                artifacts['ios_syslog_url'] = url
                        artifacts[f'{artifact_type}_url'] = url
                    if local_path:
                        artifacts[f'{artifact_type}_organized_path'] = local_path
            except Exception as e:
                logger.error(f"Failed to organize artifacts: {e}", exc_info=True)
        
        return artifacts
