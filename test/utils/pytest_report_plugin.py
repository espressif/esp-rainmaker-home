# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Pytest plugin for automatic test report generation and email distribution.
"""
import json
import os
import logging
import re
import socket
import time
import fcntl
import tempfile
import yaml
from contextlib import contextmanager
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime

from utils.common_utils import read_app_version, read_device_app_version, resolve_single_artifact, git_ref_info


@contextmanager
def _reports_lock(lock_dir=None):
    """Cross-process exclusive lock for shared reports/ files; pass the protected file's dir so runs from different cwds share one lock inode."""
    lock_path = (Path(lock_dir) if lock_dir else Path('reports')) / '.reports.lock'
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with open(lock_path, 'w') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def _atomic_write_text(path: Path, text: str) -> None:
    """Write via temp file + os.replace so a concurrent reader never sees a torn file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix='.tmp')
    try:
        with os.fdopen(fd, 'w') as handle:
            handle.write(text)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise

logger = logging.getLogger(__name__)

try:
    from utils.artifact_host import ArtifactHost, initialize_artifact_host
    from utils.report_generator import ReportGenerator
    from utils.email_sender import get_email_sender_from_config
    UTILITIES_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Some utilities not available: {e}")
    UTILITIES_AVAILABLE = False


class PytestReportPlugin:
    """Pytest plugin for generating reports and sending emails"""
    
    def __init__(self, config_path: str = "config/report_config.yaml"):
        self.config_path = config_path
        self.config = {}
        self.artifact_host = None
        self.report_generator = None
        self.email_sender = None
        
        # Test run tracking
        self.run_id = None
        self.start_time = None
        self.test_results: List[Dict] = []
        self.tracked_tests: set = set()  # Track which tests we've already recorded to avoid duplicates
        self.device_model: str = None
        self.session = None  # Store session for marker access
        self._app_version_value: Optional[str] = None  # cached device app version
        self._active_sdk_value: Optional[str] = None  # cached active SDK flavor
        
        if not UTILITIES_AVAILABLE:
            logger.warning("Required utilities not available - report generation disabled")
            return
        
        # Load config and initialize components
        self.config = self._load_config(config_path)
        self._initialize()
    
    def _load_config(self, config_path: str) -> Dict:
        """Load configuration"""
        try:
            config_file = Path(config_path)
            if config_file.exists():
                with open(config_file, 'r') as f:
                    return yaml.safe_load(f) or {}
            return {}
        except Exception as e:
            logger.error(f"Error loading config: {e}")
            return {}
    
    def _initialize(self):
        """Initialize all components"""
        if not UTILITIES_AVAILABLE:
            return
        
        # Initialize artifact host
        hosting_config = self.config.get('local_hosting', {})
        artifacts_dir = hosting_config.get('artifacts_dir', 'reports/artifacts')
        port = hosting_config.get('http_server_port', 8000)
        base_url = hosting_config.get('base_url', f'http://127.0.0.1:{port}')
        auto_start = hosting_config.get('auto_start_server', False)
        
        try:
            # Check if server is already running (standalone mode)
            from utils.artifact_host import ArtifactHost
            temp_host = ArtifactHost(artifacts_dir=artifacts_dir, port=port, base_url=base_url)
            if temp_host.is_server_running():
                logger.info(f"Using existing standalone server on port {port}")
                # Don't start server, just use existing one
                self.artifact_host = temp_host
            else:
                # Server not running - initialize but don't start (unless explicitly requested)
                self.artifact_host = initialize_artifact_host(
                    artifacts_dir=artifacts_dir,
                    port=port,
                    base_url=base_url,
                    auto_start=auto_start
                )
                if auto_start:
                    logger.info("Artifact host initialized and server started")
                else:
                    logger.info("Artifact host initialized (server not started - use standalone server)")
                    logger.info(f"Start server manually: python scripts/start_artifact_server.py")
            logger.info("Artifact host initialized")
        except Exception as e:
            logger.error(f"Failed to initialize artifact host: {e}")
        
        # Initialize report generator
        try:
            self.report_generator = ReportGenerator(self.config_path)
            logger.info("Report generator initialized")
        except Exception as e:
            logger.error(f"Failed to initialize report generator: {e}")
        
        # Initialize email sender
        try:
            self.email_sender = get_email_sender_from_config(self.config_path)
            if self.email_sender:
                logger.info("Email sender initialized")
            else:
                logger.warning("Email sender not available (check email config)")
        except Exception as e:
            logger.warning(f"Email sender not available: {e}")

    def _resolve_artifact_url(self, artifacts: dict, key: str, path_key: str,
                              artifact_type: str, organized_key: str, report_nodeid: str) -> Optional[str]:
        """Resolve one artifact to URL. Returns URL or None."""
        if key in artifacts and artifacts[key]:
            return artifacts[key]
        org_path = artifacts.get(organized_key)
        if org_path and os.path.exists(org_path) and self.artifact_host:
            return self.artifact_host.get_artifact_url(org_path)
        src_path = artifacts.get(path_key)
        if src_path and self.artifact_host:
            test_name = report_nodeid.split("::")[-1] if report_nodeid else None
            return resolve_single_artifact(
                self.artifact_host, src_path, artifact_type,
                self.run_id, test_name
            )
        return None

    def pytest_sessionstart(self, session):
        """Called when test session starts."""
        if not UTILITIES_AVAILABLE:
            logger.debug("Report plugin: utilities not available, skipping sessionstart")
            return
        logger.info("Report plugin: pytest_sessionstart entered")
        self.session = session
        try:
            self.device_model = session.config.getoption("--model", default=None)
        except Exception:
            pass
        # Make run_id unique per process so parallel Android+iOS runs never share
        # a run directory (second-resolution timestamps collide). The model slug
        # keeps it readable; the PID guarantees uniqueness if models match.
        model_slug = re.sub(r"[^A-Za-z0-9]+", "", (self.device_model or "").split(",")[0]) or "dev"
        self.run_id = f"{datetime.now().strftime('%H%M%S_%d%m%Y')}_{model_slug}_{os.getpid()}"
        self.start_time = time.time()
        if self.artifact_host:
            try:
                self.artifact_host.current_run_id = self.run_id
                run_dir = self.artifact_host.create_run_directory(self.run_id)
                logger.info(f"Report plugin: run started {self.run_id}, run_dir={run_dir}")
            except Exception as e:
                logger.warning(f"Report plugin: failed to create run directory: {e}")
        else:
            logger.warning("Report plugin: artifact_host is None, run directory not created")
    
    def pytest_runtest_logreport(self, report):
        """Called for each test report"""
        if not UTILITIES_AVAILABLE:
            return
        
        # Only track each test once - use nodeid as unique identifier
        # Track when we have the final outcome (usually in 'call' phase, but 'skipped' can be in 'setup')
        test_key = report.nodeid
        
        # Skip if we've already tracked this test
        if test_key in self.tracked_tests:
            return
        
        # Track all test outcomes including skipped tests
        # For skipped tests, track immediately (can happen in setup phase)
        # For other outcomes, track during 'call' phase (actual test execution)
        if report.outcome == 'skipped' or (report.outcome in ['passed', 'failed', 'error'] and report.when == 'call'):
            # Mark as tracked
            self.tracked_tests.add(test_key)
            
            # Extract test information
            stdout = ''
            stderr = ''
            logs = ''
            seen_sections = set()
            
            if hasattr(report, 'capstdout'):
                stdout = report.capstdout or ''
            if hasattr(report, 'capstderr'):
                stderr = report.capstderr or ''
            
            if hasattr(report, 'sections'):
                for section in report.sections:
                    section_name = section[0].lower()
                    section_content = section[1] if len(section) > 1 else ''
                    if (section_name, section_content) in seen_sections:
                        continue
                    seen_sections.add((section_name, section_content))
                    if 'stdout' in section_name:
                        if not stdout:
                            stdout += section_content
                    elif 'stderr' in section_name:
                        if not stderr:
                            stderr += section_content
                    elif 'log' in section_name or 'call' in section_name:
                        logs += f"{section[0]}:\n{section_content}\n"
            
            if hasattr(report, 'longrepr') and report.longrepr:
                logs += f"Error Details:\n{report.longrepr}\n"
            
            test_result = {
                'nodeid': report.nodeid,
                'outcome': report.outcome,
                'duration': getattr(report, 'duration', 0),
                'retry': getattr(report, 'retry', False),
                'artifacts': {},
                'logs': logs.strip(),
                'stdout': stdout.strip(),
                'stderr': stderr.strip(),
                'hardware_info': getattr(report, 'hardware_info', []),
            }

            if not test_result['hardware_info'] and self.session:
                try:
                    from hardware.manager import get_hardware_report_for_session
                    test_result['hardware_info'] = get_hardware_report_for_session(
                        self.session
                    ).get(report.nodeid, [])
                except Exception:
                    pass
            
            # Resolve artifact URLs from report.debug_artifacts
            if hasattr(report, 'debug_artifacts'):
                artifacts = report.debug_artifacts
                nodeid = getattr(report, 'nodeid', '') or ''
                for key, value in artifacts.items():
                    if key.endswith('_url') and value:
                        test_result['artifacts'][key] = value
                # (url_key, path_key, artifact_type, organized_key)
                artifact_specs = [
                    ('screenshot_url', 'screenshot', 'screenshot', 'screenshot_organized_path'),
                    ('adb_logs_url', 'adb_logs', 'log', 'log_organized_path'),
                    ('page_source_url', 'page_source', 'page_source', 'page_source_organized_path'),
                    ('serial_log_url', 'serial_log', 'serial_log', 'serial_log_organized_path'),
                    ('cloud_api_log_url', 'cloud_api_log', 'cloud_api_log', 'cloud_api_log_organized_path'),
                ]
                for url_key, path_key, artifact_type, organized_key in artifact_specs:
                    url = self._resolve_artifact_url(
                        artifacts, url_key, path_key, artifact_type, organized_key, nodeid
                    )
                    # Reuse a generic log_url for ADB logs when nothing else resolved
                    if not url and url_key == 'adb_logs_url' and artifacts.get('log_url') and 'adb_logs' in artifacts:
                        url = artifacts['log_url']
                    if url:
                        test_result['artifacts'][url_key] = url
                if artifacts.get('chip_serial_log_name'):
                    test_result['artifacts']['chip_serial_log_name'] = artifacts['chip_serial_log_name']
            # Video comes from report.video_path
            if hasattr(report, 'video_path') and report.video_path and self.artifact_host:
                url = self.artifact_host.get_artifact_url(report.video_path)
                if not url:
                    url = resolve_single_artifact(
                        self.artifact_host, report.video_path, 'video',
                        self.run_id,
                        getattr(report, 'nodeid', '').split('::')[-1] if hasattr(report, 'nodeid') else None
                    )
                if url:
                    test_result['artifacts']['video_url'] = url
            
            if not hasattr(self, 'appium_log_url') or not self.appium_log_url:
                try:
                    # Read the active grid from its own module — `import conftest`
                    # resolves to the nearest subdir conftest (no grid_manager).
                    from utils.grid_manager import AppiumGridManager
                    grid_manager = AppiumGridManager.active_instance
                    if grid_manager and hasattr(grid_manager, 'servers'):
                        for server_key, server_info in grid_manager.servers.items():
                            if 'log_file' in server_info:
                                log_file_path = server_info['log_file']
                                if log_file_path and os.path.exists(log_file_path):
                                    if self.artifact_host:
                                        if self.run_id:
                                            self.artifact_host.current_run_id = self.run_id
                                        appium_log_url = self.artifact_host.get_artifact_url(log_file_path)
                                        if not appium_log_url:
                                            try:
                                                organized = self.artifact_host.organize_artifact(
                                                    log_file_path, 'log', run_id=self.run_id
                                                )
                                                if organized and organized.get('url'):
                                                    appium_log_url = organized.get('url')
                                            except Exception as e:
                                                logger.warning(f"Failed to organize Appium log: {e}", exc_info=True)
                                        if appium_log_url:
                                            self.appium_log_url = appium_log_url
                                            break
                except Exception as e:
                    logger.warning(f"Could not get Appium log URL: {e}")
            
            if getattr(self, 'appium_log_url', None):
                test_result['artifacts']['appium_log_url'] = self.appium_log_url

            self.test_results.append(test_result)
    
    def pytest_sessionfinish(self, session, exitstatus):
        """Called when test session finishes"""
        if not UTILITIES_AVAILABLE:
            return
        
        # Generate report even if all tests were skipped (for visibility)
        if not self.test_results:
            logger.info("No test results collected - this may be normal for collect-only or if all tests were skipped")
            # Still try to generate a minimal report if we have a run_id
            if self.run_id and self.report_generator:
                try:
                    # Create a minimal report showing no tests were executed
                    minimal_results = []
                    report_path = self.report_generator.generate_report(
                        test_results=minimal_results,
                        run_id=self.run_id,
                        test_lab=self.config.get('report', {}).get('test_lab', 'Pune'),
                        chipset=self.config.get('report', {}).get('chipset', 'Mobile Devices'),
                        execution_time="00:00:00"
                    )
                    if report_path:
                        logger.info(f"Minimal report generated: {report_path}")
                except Exception as e:
                    logger.warning(f"Could not generate minimal report: {e}")
            return
        
        # Calculate execution time
        execution_time_seconds = time.time() - self.start_time if self.start_time else 0
        hours = int(execution_time_seconds // 3600)
        minutes = int((execution_time_seconds % 3600) // 60)
        seconds = int(execution_time_seconds % 60)
        execution_time = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
        
        # Generate report
        if self.report_generator:
            try:
                hardware_info_by_test = {}
                try:
                    from hardware.manager import get_hardware_report_for_session
                    hardware_info_by_test = get_hardware_report_for_session(session)
                except Exception:
                    pass

                # "Android, SM-S711B" style label for the report header
                platform_label = self._platform_label()
                app_version = self._app_version()


                # Refresh the served Appium log at session end;
                appium_log_url = getattr(self, 'appium_log_url', None)
                try:
                    from utils.grid_manager import AppiumGridManager
                    grid = AppiumGridManager.active_instance
                    if grid and hasattr(grid, 'servers') and self.artifact_host:
                        for server_key, server_info in grid.servers.items():
                            log_file_path = server_info.get('log_file')
                            if log_file_path and os.path.exists(log_file_path):
                                try:
                                    if self.run_id:
                                        self.artifact_host.current_run_id = self.run_id
                                    organized = self.artifact_host.organize_artifact(
                                        log_file_path, 'log', run_id=self.run_id
                                    )
                                    if organized and organized.get('url'):
                                        appium_log_url = organized.get('url')
                                        self.appium_log_url = appium_log_url
                                        logger.info(f"Appium log refreshed at session finish: {appium_log_url}")
                                        break
                                except Exception as e:
                                    logger.debug(f"Failed to refresh Appium log: {e}")
                except Exception as e:
                    logger.debug(f"Could not refresh Appium log at session finish: {e}")
                
                self._update_test_history()
                git_info = git_ref_info()
                git_info["app_commit"] = self._app_commit()
                download_url = None
                if self.artifact_host and getattr(self.artifact_host, "base_url", None) and self.run_id:
                    download_url = f"{self.artifact_host.base_url}/artifacts/{self.run_id}.zip"
                # Deployment + SDK details for the report summary box (production / rmneo / ...).
                deployment = self._deployment_name()
                deployment_uri = ""
                deployment_backend = ""
                deployment_broker = ""
                deployment_region = ""
                try:
                    from utils.registered_user_resolver import load_deployment_config
                    _dep = load_deployment_config(deployment).get(deployment, {}) or {}
                    deployment_uri = _dep.get("uri", "") or ""
                    deployment_backend = _dep.get("backend", "") or ""
                    deployment_broker = _dep.get("broker", "") or ""
                    deployment_region = _dep.get("aws_region", "") or _dep.get("region", "") or ""
                except Exception:
                    deployment_uri = os.environ.get("DEPLOYMENT_URI", "") or ""
                active_sdk = self._active_sdk()
                report_path = self.report_generator.generate_report(
                    test_results=self.test_results,
                    run_id=self.run_id,
                    test_lab=self.config.get('report', {}).get('test_lab', 'Pune'),
                    chipset=platform_label,
                    execution_time=execution_time,
                    appium_log_url=appium_log_url,
                    hardware_info_by_test=hardware_info_by_test,
                    app_version=app_version,
                    git_info=git_info,
                    download_url=download_url,
                    deployment=deployment,
                    deployment_uri=deployment_uri,
                    deployment_backend=deployment_backend,
                    deployment_broker=deployment_broker,
                    deployment_region=deployment_region,
                    active_sdk=active_sdk,
                    jira_base=(os.getenv("JIRA_BASE_URL") or "").rstrip("/") or None,
                    jira_project=os.getenv("JIRA_PROJECT_KEY") or None,
                    jira_project_id=os.getenv("JIRA_PROJECT_ID") or None,
                    jira_issuetype_id=os.getenv("JIRA_ISSUETYPE_ID") or None,
                )
                
                if report_path:
                    # Generate report URL
                    if self.artifact_host:
                        report_url = self.artifact_host.get_artifact_url(report_path)
                        # Rewrite loopback hosts to this machine's name so links work off-box.
                        if report_url and ('localhost' in report_url or '127.0.0.1' in report_url):
                            host = socket.gethostname()
                            report_url = report_url.replace('localhost', host).replace('127.0.0.1', host)
                    else:
                        report_url = None
                    
                    # Persist run summary for CI post-steps (MR comment, notifications)
                    self._write_run_summary(report_path, report_url)

                    # Send email if configured
                    if self.email_sender and self.config.get('email', {}).get('send_on_completion', False):
                        self._send_report_email(report_path, report_url)

                    # Run cleanup of old artifacts
                    try:
                        from utils.artifact_cleanup import cleanup_old_artifacts
                        hosting_config = self.config.get('local_hosting', {})
                        artifacts_dir = hosting_config.get('artifacts_dir', 'reports/artifacts')
                        reports_dir = hosting_config.get('reports_dir', 'reports/html')
                        cleanup_days = hosting_config.get('cleanup_days', 15)
                        cleanup_old_artifacts(artifacts_dir, reports_dir, cleanup_days)
                    except Exception as e:
                        logger.debug(f"Artifact cleanup failed: {e}")
                else:
                    logger.error("Failed to generate report")
            except Exception as e:
                logger.error(f"Error generating report: {e}")
    
    def _platform_label(self) -> str:
        """Report header value: 'Android, SM-S711B' / 'iOS, iPhone Air'."""
        model = self.device_model or ""
        platform = ""
        try:
            with open("config/mobiles.yaml") as f:
                mobiles = yaml.safe_load(f) or {}
            platform = str((mobiles.get("mobiles", {}).get(model) or {}).get("platform", ""))
        except Exception:
            pass
        if platform and model:
            return f"{platform}, {model}"
        return model or platform or "Mobile Devices"

    def _app_version(self) -> str:
        """The app version actually installed on the device under test (adb / ideviceinstaller),
        falling back to the repo version if the device can't be queried. Cached per run."""
        if self._app_version_value is not None:
            return self._app_version_value
        version = ""
        model = self.device_model or ""
        try:
            with open("config/mobiles.yaml") as f:
                mobiles = yaml.safe_load(f) or {}
            dev = (mobiles.get("mobiles", {}).get(model) or {})
            platform = str(dev.get("platform", "")).lower()
            udid = dev.get("udid")
            with open("config/app.yaml") as f:
                app_cfg = (yaml.safe_load(f) or {}).get("rainmaker-home", {})
            if platform == "android":
                android_path = app_cfg.get("android_path")
                adb_path = app_cfg.get("adb_path") or (
                    f"{android_path.rstrip('/')}/platform-tools/adb" if android_path else "adb"
                )
                version = read_device_app_version("android", app_cfg.get("package"), udid=udid, adb_path=adb_path)
            elif platform == "ios":
                version = read_device_app_version("ios", app_cfg.get("bundle_id"), udid=udid)
        except Exception as error:
            logger.warning("Device app version lookup failed: %s", error)
        self._app_version_value = version or read_app_version()
        if version:
            logger.info("App version under test (from device): %s", self._app_version_value)
        else:
            logger.info("App version under test (repo fallback): %s", self._app_version_value)
        return self._app_version_value

    def _app_commit(self) -> str:
        """Short git commit of the esp-rainmaker-home app repo (CI env var first, then local git)."""
        commit = os.environ.get("CI_COMMIT_SHORT_SHA", "").strip()
        if commit:
            return commit
        try:
            import subprocess
            repo_root = Path(__file__).resolve().parents[2]
            commit = subprocess.run(
                ["git", "rev-parse", "--short", "HEAD"],
                cwd=str(repo_root), capture_output=True, text=True, timeout=5,
            ).stdout.strip()
        except Exception as error:
            logger.warning("Could not read app git commit: %s", error)
            commit = ""
        return commit

    def _deployment_name(self) -> str:
        """The --deployment name for this run (default 'production'); '' if unavailable."""
        try:
            if self.session and self.session.config:
                return self.session.config.getoption("--deployment", default="") or ""
        except Exception:
            pass
        return ""

    def _active_sdk(self) -> str:
        """Active SDK flavor: ACTIVE_SDK env override, else the repo-root .env ACTIVE_SDK. Cached per run."""
        if self._active_sdk_value is not None:
            return self._active_sdk_value
        active_sdk = os.environ.get("ACTIVE_SDK", "") or ""
        if not active_sdk:
            try:
                _env_file = Path(__file__).resolve().parents[2] / ".env"
                if _env_file.exists():
                    for _line in _env_file.read_text().splitlines():
                        _s = _line.strip()
                        if _s.startswith("ACTIVE_SDK=") and not _s.startswith("#"):
                            active_sdk = _s.split("=", 1)[1].strip().strip('"').strip("'")
                            break
            except Exception:
                active_sdk = ""
        self._active_sdk_value = active_sdk
        return active_sdk

    def _update_test_history(self, max_per_test: int = 20):
        """Append this run's per-test outcomes to the shared test_history.json (trimmed)."""
        try:
            reports_dir = os.path.expanduser(self.config.get('local_hosting', {}).get('reports_dir', 'reports/html'))
            hist_path = Path(reports_dir).parent / 'test_history.json'
            ts = datetime.now().strftime("%d-%m-%Y %H:%M")
            version = self._app_version()
            branch = (git_ref_info() or {}).get("branch", "")
            platform = self._platform_label()
            deployment = self._deployment_name()
            active_sdk = self._active_sdk()
            with _reports_lock(hist_path.parent):
                history = json.loads(hist_path.read_text()) if hist_path.exists() else {}
                for t in self.test_results:
                    nid = t.get('nodeid', '')
                    if not nid:
                        continue
                    history.setdefault(nid, []).append(
                        {"ts": ts, "outcome": t.get('outcome', 'unknown'), "version": version,
                         "branch": branch, "platform": platform, "run_id": self.run_id,
                         "deployment": deployment, "active_sdk": active_sdk}
                    )
                    history[nid] = history[nid][-max_per_test:]
                _atomic_write_text(hist_path, json.dumps(history, indent=2))
        except Exception as e:
            logger.warning("Could not update test history: %s", e)

    def _write_run_summary(self, report_path: str, report_url: str = None):
        """
        Persist run summary JSON for CI post-steps (e.g. scripts/notify_mr.py).

        Written to reports/last_run_summary.json relative to test/.
        """
        try:
            total_pass = sum(1 for t in self.test_results if t['outcome'] == 'passed' and not t.get('retry'))
            total_fail = sum(1 for t in self.test_results if t['outcome'] == 'failed')
            total_retry = sum(1 for t in self.test_results if t.get('retry', False))
            total_skip = sum(1 for t in self.test_results if t['outcome'] == 'skipped')
            total_tests = len(self.test_results)
            total_abort = total_tests - total_pass - total_fail - total_retry - total_skip
            effective_pass = total_pass + total_retry
            graded = total_tests - total_skip
            pass_pct = (effective_pass / graded * 100) if graded > 0 else 0
            min_pass = self.config.get('report', {}).get('min_pass_percentage', 80)
            if graded == 0:
                run_status = 'NO TESTS RUN'
            elif effective_pass == 0 and total_fail == 0:
                run_status = 'ABORTED'
            elif total_fail == 0 and total_abort == 0:
                run_status = 'ALL PASSED'
            elif pass_pct >= min_pass:
                run_status = 'MOSTLY PASSED'
            else:
                run_status = 'FAILED'
            summary = {
                'run_id': self.run_id,
                'model': getattr(self, 'device_model', None) or '',
                'report_path': report_path,
                'report_url': report_url or '',
                'total_tests': total_tests,
                'total_pass': total_pass,
                'total_fail': total_fail,
                'total_retry': total_retry,
                'total_skip': total_skip,
                'total_abort': total_abort,
                'pass_percentage': round(pass_pct, 1),
                'status': run_status,
            }
            with _reports_lock():
                _atomic_write_text(Path('reports') / 'last_run_summary.json', json.dumps(summary, indent=2))
            logger.info("Run summary written: reports/last_run_summary.json")
        except Exception as e:
            logger.warning(f"Could not write run summary: {e}")

    def _send_report_email(self, report_path: str, report_url: str = None):
        """Send report email to stakeholders"""
        if not self.email_sender:
            return
        
        # Load stakeholder configuration from report_config
        stakeholders_config = self.config.get('stakeholders', {})
        
        # Determine which recipients to use based on pytest markers
        # Check command line option -m (marker expression) first
        marker_name = 'default'
        try:
            if self.session and self.session.config:
                # Get marker expression from command line
                marker_expr = self.session.config.getoption("-m", default=None)
                if marker_expr:
                    # Parse marker expression (e.g., "sanity", "sanity or regression")
                    # For simple cases, just use the marker name directly
                    # Remove common operators and whitespace
                    marker_expr = marker_expr.strip().lower()
                    # Check if it's a simple marker name (no operators)
                    if marker_expr and ' ' not in marker_expr and 'or' not in marker_expr and 'and' not in marker_expr:
                        marker_name = marker_expr
                    # If it contains multiple markers, try to find the first one that matches
                    elif 'or' in marker_expr:
                        for possible_marker in marker_expr.split('or'):
                            possible_marker = possible_marker.strip()
                            if possible_marker in stakeholders_config:
                                marker_name = possible_marker
                                break
                
                # If marker not found from command line, check collected items
                if marker_name == 'default' and hasattr(self.session, 'items'):
                    for item in self.session.items:
                        for marker in item.iter_markers():
                            marker_name = marker.name
                            if marker_name in stakeholders_config:
                                break
                        if marker_name != 'default' and marker_name in stakeholders_config:
                            break
        except Exception as e:
            logger.debug(f"Error determining marker: {e}")
        
        # Use marker-specific recipients if available, otherwise default
        if marker_name in stakeholders_config:
            recipients_config = stakeholders_config.get(marker_name, {})
            logger.info(f"Using '{marker_name}' stakeholder list for email recipients")
        else:
            recipients_config = stakeholders_config.get('default', {})
            logger.info(f"Using 'default' stakeholder list for email recipients")
        
        recipients = list(recipients_config.get('recipients', []))

        # Always notify the person whose change triggered the CI pipeline
        trigger_email = os.environ.get("GITLAB_USER_EMAIL", "").strip()
        if trigger_email and trigger_email not in recipients:
            recipients.append(trigger_email)
            logger.info(f"Added pipeline triggerer to recipients: {trigger_email}")

        if not recipients:
            logger.warning("No email recipients configured")
            return
        
        # Calculate summary stats
        total_pass = sum(1 for t in self.test_results if t['outcome'] == 'passed' and not t.get('retry'))
        total_fail = sum(1 for t in self.test_results if t['outcome'] == 'failed')
        total_retry = sum(1 for t in self.test_results if t.get('retry', False))
        total_skip = sum(1 for t in self.test_results if t['outcome'] == 'skipped')
        total_tests = len(self.test_results)
        # Skipped tests are intentional non-runs — exclude from the pass ratio.
        total_abort = total_tests - total_pass - total_fail - total_retry - total_skip
        effective_pass = total_pass + total_retry
        graded = total_tests - total_skip
        pass_percentage = round((effective_pass / graded * 100), 1) if graded > 0 else 0

        summary_stats = {
            'total_pass': total_pass,
            'total_fail': total_fail,
            'total_retry': total_retry,
            'total_skip': total_skip,
            'total_abort': total_abort,
            'total_tests': total_tests,
            'pass_percentage': pass_percentage
        }

        # Determine status for subject (effective_pass = pass + pass-on-retry)
        min_pass = self.config.get('report', {}).get('min_pass_percentage', 80)
        if graded == 0:
            status = "NO TESTS RUN"
        elif effective_pass == 0 and total_fail == 0:
            status = "ABORTED"
        elif total_fail == 0 and total_abort == 0:
            status = "ALL PASSED"
        elif pass_percentage >= min_pass:
            status = "MOSTLY PASSED"
        else:
            status = "FAILED"
        
        # Generate subject
        email_config = self.config.get('email', {})
        subject_template = email_config.get('subject_template', 'Test Report - {date} - {status}')
        date_str = datetime.now().strftime("%d-%m-%Y")
        subject = subject_template.format(date=date_str, status=status)
        app_version = self._app_version()
        if app_version:
            subject = f"{subject} - v{app_version}"

        # Send email
        attach_report = email_config.get('attach_report', True)
        attach_screenshot = email_config.get('attach_screenshot', True)
        success = self.email_sender.send_report_email(
            recipients=recipients,
            subject=subject,
            report_path=report_path,
            report_url=report_url,
            summary_stats=summary_stats,
            attach_report=attach_report,
            attach_screenshot=attach_screenshot,
            app_version=app_version,
            git_info=git_ref_info(),
        )
        
        if success:
            logger.info(f"Report email sent to {len(recipients)} recipients")
        else:
            logger.error("Failed to send report email")
