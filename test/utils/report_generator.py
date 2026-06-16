# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Test report generator for creating professional HTML reports
"""
import json
import shutil
import socket
import yaml
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Any


def _primary_ip() -> str:
    """Best-effort primary LAN IP so report links work even when name resolution
    (DNS/mDNS) fails. Set REPORT_BASE_URL to override with a fixed host."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))  # no packets sent; just selects the egress interface
        return s.getsockname()[0]
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "127.0.0.1"
    finally:
        s.close()
from collections import defaultdict

try:
    from jinja2 import Environment, FileSystemLoader
    JINJA2_AVAILABLE = True
except ImportError:
    JINJA2_AVAILABLE = False

logger = logging.getLogger(__name__)


class TestSuite:
    """Represents a test suite with statistics"""
    
    def __init__(self, suite_id: int, name: str):
        self.id = suite_id
        self.name = name
        self.pass_count = 0
        self.fail_count = 0
        self.retry_count = 0
        self.abort_count = 0
        self.log_url: Optional[str] = None
        self.appium_log_url: Optional[str] = None
        self.status = "completed"
        self.tests: List[Dict] = []
    
    @property
    def total_count(self) -> int:
        return self.pass_count + self.fail_count + self.retry_count + self.abort_count
    
    @property
    def pass_percentage(self) -> float:
        if self.total_count == 0:
            return 0.0
        # Pass-on-retry counts as pass for percentage
        effective_pass = self.pass_count + self.retry_count
        return round((effective_pass / self.total_count) * 100, 1)
    
    def add_test_result(self, outcome: str, retry: bool = False):
        """Add a test result"""
        if outcome == "passed":
            if retry:
                self.retry_count += 1
            else:
                self.pass_count += 1
        elif outcome == "failed":
            self.fail_count += 1
        elif outcome == "skipped" or outcome == "error":
            self.abort_count += 1


class ReportGenerator:
    """Generates professional HTML test reports"""
    
    def __init__(self, config_path: str = "config/report_config.yaml"):
        self.config = self._load_config(config_path)
        self.template_dir = Path("templates").resolve()
        if not self.template_dir.exists():
            self.template_dir = Path("templates")
        
        # Get reports directory - expand ~ and resolve to absolute path
        reports_dir_str = self.config.get('local_hosting', {}).get('reports_dir', 'reports/html')
        if reports_dir_str.startswith('~'):
            reports_dir_str = str(Path.home() / reports_dir_str[1:].lstrip('/'))
        self.reports_dir = Path(reports_dir_str).expanduser().resolve()
        self.reports_dir.mkdir(parents=True, exist_ok=True)
        
        if not JINJA2_AVAILABLE:
            logger.error("Jinja2 not available. Install with: pip install jinja2")
            raise ImportError("Jinja2 is required for report generation")
        
        # Setup Jinja2 environment
        self.jinja_env = Environment(
            loader=FileSystemLoader(str(self.template_dir)),
            autoescape=True
        )
        
        # Verify template exists
        template_path = self.template_dir / "report_template.html"
        if not template_path.exists():
            logger.warning(f"Template not found at {template_path}")
    
    def _load_config(self, config_path: str) -> Dict:
        """Load configuration from YAML file"""
        try:
            config_file = Path(config_path)
            if config_file.exists():
                with open(config_file, 'r') as f:
                    return yaml.safe_load(f) or {}
            else:
                logger.warning(f"Config file not found: {config_path}, using defaults")
                return {}
        except Exception as e:
            logger.error(f"Error loading config: {e}")
            return {}
    
    def _parse_test_name(self, test_name: str) -> tuple:
        """
        Parse test name to extract category and suite name
        Format: category.suite_name or just suite_name
        """
        parts = test_name.split('.')
        if len(parts) >= 2:
            category = parts[0].replace('_', ' ').title()
            suite_name = '.'.join(parts[1:])
        else:
            category = "Other Tests"
            suite_name = test_name
        
        return category, suite_name
    
    def _extract_suite_from_test(self, test_nodeid: str) -> str:
        """Extract suite name from test nodeid"""
        # Remove file path and test function name
        # Example: tests/login/test_login.py::test_login -> login
        parts = test_nodeid.split('::')
        if len(parts) > 0:
            file_part = parts[0]
            # Extract directory name or file name without extension
            if '/' in file_part:
                dir_name = file_part.split('/')[-2] if '/' in file_part else file_part
            else:
                dir_name = Path(file_part).stem
            return dir_name
        return "unknown"
    
    def _categorize_tests(self, test_results: List[Dict]) -> Dict[str, List[TestSuite]]:
        """Categorize tests into suites and categories"""
        suites_dict: Dict[str, TestSuite] = {}
        categories: Dict[str, List[TestSuite]] = defaultdict(list)
        
        suite_id = 1
        
        # Track which tests we've already added to avoid duplicates
        seen_tests = set()
        
        for test in test_results:
            nodeid = test.get('nodeid', '')
            outcome = test.get('outcome', 'unknown')
            retry = test.get('retry', False)
            
            # Skip if we've already processed this test
            if nodeid in seen_tests:
                continue
            seen_tests.add(nodeid)
            
            # Extract suite name
            suite_name = self._extract_suite_from_test(nodeid)
            category, _ = self._parse_test_name(suite_name)
            
            # Create or get suite
            suite_key = f"{category}::{suite_name}"
            if suite_key not in suites_dict:
                suite = TestSuite(suite_id, suite_name)
                suites_dict[suite_key] = suite
                categories[category].append(suite)
                suite_id += 1
            
            suite = suites_dict[suite_key]
            suite.add_test_result(outcome, retry)
            suite.tests.append(test)
        
        return dict(categories)
    
    def _calculate_summary_stats(self, test_results: List[Dict]) -> Dict[str, Any]:
        """Calculate summary statistics"""
        total_pass = 0
        total_fail = 0
        total_retry = 0
        total_abort = 0
        
        for test in test_results:
            outcome = test.get('outcome', 'unknown')
            retry = test.get('retry', False)
            
            if outcome == "passed":
                if retry:
                    total_retry += 1
                else:
                    total_pass += 1
            elif outcome == "failed":
                total_fail += 1
            elif outcome == "skipped":
                # Count skipped tests as abort
                total_abort += 1
            else:
                # error, xfailed, etc.
                total_abort += 1
        
        total_tests = total_pass + total_fail + total_retry + total_abort
        # Pass-on-retry counts as pass for percentage
        effective_pass = total_pass + total_retry
        pass_percentage = round((effective_pass / total_tests * 100), 1) if total_tests > 0 else 0
        
        return {
            'total_pass': total_pass,
            'total_fail': total_fail,
            'total_retry': total_retry,
            'total_abort': total_abort,
            'total_tests': total_tests,
            'pass_percentage': pass_percentage
        }
    
    def _get_artifact_urls(self, test: Dict) -> Optional[str]:
        """Extract artifact URL from test metadata"""
        # Check for artifact URLs in test metadata
        artifacts = test.get('artifacts', {})
        if isinstance(artifacts, dict):
            # Prefer log URL, then video, then screenshot
            for key in ['log_url', 'video_url', 'screenshot_url']:
                if key in artifacts:
                    return artifacts[key]
        return None
    
    def generate_report(self, test_results: List[Dict],
                        run_id: str = None,
                        test_lab: str = "Pune",
                        chipset: str = "Mobile Devices",
                        execution_time: str = None,
                        appium_log_url: str = None,
                        hardware_info_by_test: Optional[Dict[str, Dict[str, str]]] = None,
                        app_version: str = "") -> str:
        """
        Generate HTML report from test results
        
        Args:
            test_results: List of test result dictionaries
            run_id: Test run identifier
            test_lab: Test lab name
            chipset: Chipset/device information
            execution_time: Execution time string (e.g., "03:28:33")
        
        Returns:
            Path to generated HTML report
        """
        # Allow empty test results for minimal reports
        # if not test_results:
        #     logger.warning("No test results provided")
        #     return None
        
        # Calculate statistics (handle empty results)
        if not test_results:
            # Create empty stats for minimal report
            stats = {
                'total_pass': 0,
                'total_fail': 0,
                'total_retry': 0,
                'total_abort': 0,
                'total_tests': 0,
                'pass_percentage': 0
            }
            categories = {}
        else:
            if hardware_info_by_test:
                for test in test_results:
                    if not test.get("hardware_info"):
                        test["hardware_info"] = hardware_info_by_test.get(test.get("nodeid", ""), {})

            stats = self._calculate_summary_stats(test_results)
            # Categorize tests
            categories = self._categorize_tests(test_results)
        
        # Add log URLs to suites - point to directory for navigation
        for category, suites in categories.items():
            for suite in suites:
                # Generate directory URL for test artifacts (run_id based)
                # This allows navigation to all test artifacts
                if test_results and len(test_results) > 0:
                    # Use passed run_id, or extract from artifact URLs if not provided
                    effective_run_id = run_id
                    if effective_run_id is None:
                        for test in suite.tests:
                            artifacts = test.get('artifacts', {})
                            if 'log_url' in artifacts:
                                url = artifacts['log_url']
                                if '/artifacts/' in url:
                                    parts = url.split('/artifacts/')
                                    if len(parts) > 1:
                                        effective_run_id = parts[1].split('/')[0]
                                        break
                    
                    if effective_run_id:
                        # Point to artifacts directory for this run
                        base_url = self.config.get('local_hosting', {}).get('base_url') or f'http://{_primary_ip()}:8000'
                        suite.log_url = f"{base_url}/artifacts/{effective_run_id}"
                    else:
                        # Fallback: use first test's log URL if available
                        for test in suite.tests:
                            log_url = self._get_artifact_urls(test)
                            if log_url:
                                # Convert file URL to directory URL
                                if '/logs/' in log_url:
                                    suite.log_url = log_url.rsplit('/logs/', 1)[0]
                                    break
                
                # Per-suite Appium log URL from the first test that has one
                for test in suite.tests:
                    appium_url = test.get('artifacts', {}).get('appium_log_url')
                    if appium_url:
                        suite.appium_log_url = appium_url
                        break

        # Session-level Appium log URL: explicit arg, else first suite that has one
        resolved_appium_log_url = appium_log_url or next(
            (suite.appium_log_url for suites in categories.values()
             for suite in suites if suite.appium_log_url),
            None,
        )
        
        # Prepare template data
        now = datetime.now()
        template_data = {
            'report_title': self.config.get('report', {}).get('title', 'Test Report'),
            'app_version': app_version,
            'created_time': now.strftime("%d-%m-%Y %H:%M:%S"),
            'test_lab': test_lab,
            'platform': chipset,
            'execution_time': execution_time or self._calculate_execution_time(test_results),
            'download_url': None,  # Can be added later
            'total_pass': stats['total_pass'],
            'total_fail': stats['total_fail'],
            'total_retry': stats['total_retry'],
            'total_abort': stats['total_abort'],
            'total_tests': stats['total_tests'],
            'pass_percentage': stats['pass_percentage'],
            'test_categories': categories,
            'appium_log_url': resolved_appium_log_url,
        }
        
        # Render template
        try:
            template = self.jinja_env.get_template('report_template.html')
            html_content = template.render(**template_data)
        except Exception as e:
            logger.error(f"Error rendering template: {e}")
            raise
        
        # Save report
        if run_id:
            report_filename = f"report_{run_id}.html"
        else:
            timestamp = now.strftime("%H%M%S_%d%m%Y")
            report_filename = f"report_{timestamp}.html"
        
        report_path = self.reports_dir / report_filename
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(html_content)

        latest_path = self.reports_dir / "report_latest.html"
        shutil.copy2(report_path, latest_path)
        logger.info("Updated report alias: %s", latest_path)

        # Copy logo to reports directory if it exists in templates
        logo_source = self.template_dir / "espressif_logo.png"
        if logo_source.exists():
            logo_dest = self.reports_dir / "espressif_logo.png"
            if not logo_dest.exists():
                shutil.copy2(logo_source, logo_dest)
        
        logger.info(f"Report generated: {report_path}")
        return str(report_path)
    
    def _calculate_execution_time(self, test_results: List[Dict]) -> str:
        """Calculate total execution time from test results"""
        total_seconds = 0
        for test in test_results:
            duration = test.get('duration', 0)
            if duration:
                total_seconds += duration
        
        hours = int(total_seconds // 3600)
        minutes = int((total_seconds % 3600) // 60)
        seconds = int(total_seconds % 60)
        
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    
    def generate_from_pytest_json(self, json_path: str, **kwargs) -> str:
        """Generate report from pytest JSON report"""
        try:
            with open(json_path, 'r') as f:
                data = json.load(f)
            
            # Extract test results
            test_results = []
            for test in data.get('tests', []):
                test_results.append({
                    'nodeid': test.get('nodeid', ''),
                    'outcome': test.get('outcome', 'unknown'),
                    'duration': test.get('duration', 0),
                    'retry': test.get('retry', False),
                    'artifacts': test.get('artifacts', {})
                })
            
            return self.generate_report(test_results, **kwargs)
        except Exception as e:
            logger.error(f"Error reading pytest JSON: {e}")
            raise
