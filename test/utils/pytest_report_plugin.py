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
import yaml
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime

from utils.common_utils import read_app_version, resolve_single_artifact

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
                app_version = read_app_version()


                # Try to get Appium log URL if not already captured
                appium_log_url = getattr(self, 'appium_log_url', None)
                if not appium_log_url:
                    try:
                        from conftest import grid_manager
                        if grid_manager and hasattr(grid_manager, 'servers'):
                            # Try to get log file from any available server
                            for server_key, server_info in grid_manager.servers.items():
                                if 'log_file' in server_info:
                                    log_file_path = server_info['log_file']
                                    if log_file_path and os.path.exists(log_file_path):
                                        if self.artifact_host:
                                            # Try to get URL (will organize if needed)
                                            appium_log_url = self.artifact_host.get_artifact_url(log_file_path)
                                            if not appium_log_url:
                                                # Try organizing explicitly
                                                try:
                                                    organized = self.artifact_host.organize_artifact(
                                                        log_file_path, 'log', run_id=self.run_id
                                                    )
                                                    if organized and organized.get('url'):
                                                        appium_log_url = organized.get('url')
                                                except Exception as e:
                                                    logger.debug(f"Failed to organize Appium log: {e}")
                                            
                                            if appium_log_url:
                                                self.appium_log_url = appium_log_url
                                                logger.info(f"Appium log URL captured at session finish: {appium_log_url}")
                                                break
                    except Exception as e:
                        logger.debug(f"Could not get Appium log URL at session finish: {e}")
                
                report_path = self.report_generator.generate_report(
                    test_results=self.test_results,
                    run_id=self.run_id,
                    test_lab=self.config.get('report', {}).get('test_lab', 'Pune'),
                    chipset=platform_label,
                    execution_time=execution_time,
                    appium_log_url=appium_log_url,
                    hardware_info_by_test=hardware_info_by_test,
                    app_version=app_version,
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

    def _write_run_summary(self, report_path: str, report_url: str = None):
        """
        Persist run summary JSON for CI post-steps (e.g. scripts/notify_mr.py).

        Written to reports/last_run_summary.json relative to test/.
        """
        try:
            # Bucket each test exactly once so the totals always sum to total_tests.
            total_pass = sum(1 for t in self.test_results if t['outcome'] == 'passed')
            total_fail = sum(1 for t in self.test_results if t['outcome'] == 'failed')
            total_skip = sum(1 for t in self.test_results if t['outcome'] == 'skipped')
            total_tests = len(self.test_results)
            total_abort = total_tests - total_pass - total_fail - total_skip
            graded = total_pass + total_fail + total_abort
            pass_pct = (total_pass / graded * 100) if graded else 0
            if total_fail == 0 and total_abort == 0:
                run_status = 'ALL PASSED'
            elif pass_pct >= 70:
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
                'total_skip': total_skip,
                'total_abort': total_abort,
                'pass_percentage': round(pass_pct, 1),
                'status': run_status,
            }
            out_dir = Path('reports')
            out_dir.mkdir(parents=True, exist_ok=True)
            (out_dir / 'last_run_summary.json').write_text(json.dumps(summary, indent=2))
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
        if graded > 0 and effective_pass == 0 and total_fail == 0:
            status = "ABORTED"
        elif total_fail == 0 and total_abort == 0:
            status = "ALL PASSED"
        elif pass_percentage >= 70:
            status = "MOSTLY PASSED"
        else:
            status = "FAILED"
        
        # Generate subject
        email_config = self.config.get('email', {})
        subject_template = email_config.get('subject_template', 'Test Report - {date} - {status}')
        date_str = datetime.now().strftime("%d-%m-%Y")
        subject = subject_template.format(date=date_str, status=status)
        app_version = read_app_version()
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
            app_version=app_version
        )
        
        if success:
            logger.info(f"Report email sent to {len(recipients)} recipients")
        else:
            logger.error("Failed to send report email")
