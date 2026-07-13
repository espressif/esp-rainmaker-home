# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Email sender utility using SMTP (Office365) for sending test reports
"""
import os
import smtplib
import logging
import time
from pathlib import Path
from typing import List, Optional, Dict
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email.mime.image import MIMEImage
from email import encoders

logger = logging.getLogger(__name__)

# Try to import screenshot utilities
try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options as ChromeOptions
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False
    logger.debug("Selenium not available for screenshot generation")


class EmailSender:
    """Sends emails using SMTP (Office365)"""
    
    def __init__(self, smtp_server: str = "smtp.office365.com", 
                 smtp_port: int = 587,
                 sender: str = None, 
                 password: str = None):
        """
        Initialize email sender
        
        Args:
            smtp_server: SMTP server address
            smtp_port: SMTP server port
            sender: Sender email address
            password: Sender email password
        """
        self.smtp_server = smtp_server
        self.smtp_port = smtp_port
        self.sender = sender
        self.password = password
        
        if not self.sender or not self.password:
            logger.warning("Email sender credentials not provided")
    
    def _capture_report_screenshot(self, report_path: str, screenshot_path: str = None) -> Optional[str]:
        """Capture screenshot of HTML report using headless browser"""
        if not SELENIUM_AVAILABLE:
            logger.warning("Selenium not available - cannot capture report screenshot")
            return None
        
        if not report_path or not os.path.exists(report_path):
            logger.warning(f"Report file not found: {report_path}")
            return None
        
        if screenshot_path is None:
            screenshot_path = str(Path(report_path).with_suffix('.png'))
        
        try:
            # Setup headless Chrome
            chrome_options = ChromeOptions()
            chrome_options.add_argument('--headless')
            chrome_options.add_argument('--no-sandbox')
            chrome_options.add_argument('--disable-dev-shm-usage')
            chrome_options.add_argument('--window-size=1400,2000')
            chrome_options.add_argument('--disable-gpu')
            chrome_options.add_argument('--hide-scrollbars')
            
            # Create driver (will use system Chrome/ChromeDriver if available)
            try:
                driver = webdriver.Chrome(options=chrome_options)
            except Exception as e:
                logger.warning(f"ChromeDriver not available: {e}. Screenshot capture disabled.")
                return None
            
            try:
                # Load the HTML report
                file_url = f"file://{os.path.abspath(report_path)}"
                driver.get(file_url)
                
                # Wait for page to load and charts to render
                time.sleep(3)  # Give Chart.js time to render

                try:
                    total_height = driver.execute_script(
                        "return Math.max(document.body.scrollHeight, "
                        "document.documentElement.scrollHeight);"
                    )
                    if total_height and int(total_height) > 2000:
                        driver.set_window_size(1400, min(int(total_height) + 200, 16000))
                        time.sleep(1)
                except Exception as e:
                    logger.debug("Could not resize window for full-page screenshot: %s", e)

                # Take screenshot of full page
                driver.save_screenshot(screenshot_path)
                logger.info(f"Report screenshot saved: {screenshot_path}")
                return screenshot_path
                
            finally:
                driver.quit()
                
        except Exception as e:
            logger.warning(f"Failed to capture report screenshot: {e}")
            return None
    
    def _create_email_body(self, report_path: str = None, report_url: str = None,
                          summary_stats: Dict = None, screenshot_path: str = None,
                          app_version: str = "", git_info: Dict = None) -> str:
        """Create HTML email body"""
        # App version banner — prominent, right below the heading
        app_version_html = ""
        if app_version:
            app_version_html = f'''
            <div style="text-align: center; margin: 6px 0 14px 0;">
                <span style="display: inline-block; background: #667eea; color: #ffd54f; font-size: 18px; font-weight: 800; letter-spacing: 0.5px; padding: 6px 18px; border-radius: 14px;">App Version: v{app_version}</span>
            </div>
            '''

        git_info = git_info or {}
        git_html = ""
        if git_info.get("branch") or git_info.get("mr_iid"):
            parts = []
            if git_info.get("branch"):
                parts.append(f"Branch: <strong>{git_info['branch']}</strong>")
            if git_info.get("mr_iid"):
                mr = f"MR !{git_info['mr_iid']}"
                if git_info.get("mr_title"):
                    mr += f" &middot; {git_info['mr_title']}"
                parts.append(mr)
            git_html = f'''
            <div style="text-align: center; margin: 0 0 14px 0; color: #555; font-size: 14px;">{" &nbsp;|&nbsp; ".join(parts)}</div>
            '''

        # Report link at the top (before summary) - always show
        report_link_html = ""
        if report_url:
            report_link_html = f'''
            <div style="text-align: center; margin: 10px 0;">
                <a href="{report_url}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold; font-size: 16px; margin-bottom: 10px;">📊 View Full Test Report</a>
            </div>
            '''
        elif report_path:
            # Generate a file:// URL for local access
            import urllib.parse
            file_url = f"file://{os.path.abspath(report_path)}"
            report_link_html = f'''
            <div style="text-align: center; margin: 20px 0;">
                <p style="color: #666; margin-bottom: 10px;">The full report is attached to this email.</p>
                <a href="{file_url}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold; font-size: 16px;">Open Report File</a>
            </div>
            '''
        else:
            report_link_html = '''
            <div style="text-align: center; margin: 20px 0;">
                <p style="color: #666;">Report details are included below.</p>
            </div>
            '''
        
        # Screenshot embedded in email (using Content-ID for better email client support)
        # Make it large and visible without needing to click to enhance
        screenshot_html = ""
        if screenshot_path and os.path.exists(screenshot_path):
            # Use Content-ID reference (will be attached separately)
            # Set width to 800px for better visibility, with max-width as fallback
            screenshot_html = f'''
            <div style="margin: 20px 0; text-align: center;">
                <img src="cid:report_screenshot" alt="Test Report Screenshot" style="width: 800px; max-width: 100%; height: auto; border: 2px solid #ddd; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.15); display: block; margin: 0 auto;" />
                <p style="margin-top: 15px; color: #666; font-size: 13px;">Click the button above to view the full interactive report</p>
            </div>
            '''
        
        stats_html = ""
        if summary_stats:
            stats_html = f"""
            <div style="margin: 20px 0;">
                <h3>Test Summary</h3>
                <table style="border-collapse: collapse; width: 100%;">
                    <tr>
                        <td style="padding: 8px; background: #d4edda;"><strong>Pass:</strong></td>
                        <td style="padding: 8px;">{summary_stats.get('total_pass', 0)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; background: #f8d7da;"><strong>Fail:</strong></td>
                        <td style="padding: 8px;">{summary_stats.get('total_fail', 0)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; background: #e2e3e5;"><strong>Skip:</strong></td>
                        <td style="padding: 8px;">{summary_stats.get('total_skip', 0)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; background: #fff3cd;"><strong>Pass in Retries:</strong></td>
                        <td style="padding: 8px;">{summary_stats.get('total_retry', 0)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; background: #d1ecf1;"><strong>Abort:</strong></td>
                        <td style="padding: 8px;">{summary_stats.get('total_abort', 0)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px;"><strong>Total Tests:</strong></td>
                        <td style="padding: 8px;">{summary_stats.get('total_tests', 0)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px;"><strong>Pass %:</strong></td>
                        <td style="padding: 8px;">{summary_stats.get('pass_percentage', 0)}%</td>
                    </tr>
                </table>
            </div>
            """
        
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 900px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; }}
                .content {{ background: #f9f9f9; padding: 20px; border-radius: 8px; margin-top: 20px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="content">
                    {app_version_html}
                    {git_html}
                    {report_link_html}
                    {screenshot_html}
                    {stats_html}
                    <p>Best regards,<br>Test Automation System</p>
                </div>
            </div>
        </body>
        </html>
        """
        return html_body
    
    def send_report_email(self, recipients: List[str], subject: str,
                         report_path: str = None, report_url: str = None,
                         summary_stats: Dict = None, attach_report: bool = True,
                         attach_screenshot: bool = True, app_version: str = "",
                         git_info: Dict = None) -> bool:
        """
        Send test report email via SMTP
        
        Args:
            recipients: List of email addresses
            subject: Email subject
            report_path: Path to HTML report file (for attachment)
            report_url: URL to hosted report (for link)
            summary_stats: Summary statistics dictionary
            attach_report: Whether to attach the report file
            attach_screenshot: Whether to capture and embed report screenshot
        
        Returns:
            True if email sent successfully, False otherwise
        """
        if not self.sender or not self.password:
            logger.error("Email sender credentials not set")
            return False
        if not recipients:
            logger.error("No recipients specified")
            return False
        
        try:
            # Capture report screenshot if requested
            screenshot_path = None
            if attach_screenshot and report_path and os.path.exists(report_path):
                screenshot_path = self._capture_report_screenshot(report_path)
            
            # Create email body (with screenshot embedded)
            html_body = self._create_email_body(report_path, report_url, summary_stats, screenshot_path, app_version, git_info)
            
            # Create message
            msg = MIMEMultipart('related')  # Use 'related' to support embedded images
            msg['Subject'] = subject
            msg['From'] = self.sender
            msg['To'] = ", ".join(recipients)
            
            # Add HTML body
            html_part = MIMEText(html_body, 'html')
            msg.attach(html_part)
            
            if screenshot_path and os.path.exists(screenshot_path):
                try:
                    with open(screenshot_path, 'rb') as f:
                        img = MIMEImage(f.read())
                        # Use Content-ID for embedding, not attachment
                        img.add_header('Content-ID', '<report_screenshot>')
                        # Don't set Content-Disposition as attachment - this embeds it in the body
                        msg.attach(img)
                        logger.info(f"Embedded screenshot in email body: {screenshot_path}")
                except Exception as e:
                    logger.warning(f"Failed to embed screenshot: {e}")
            
            # Connect to SMTP server and send email (context manager ensures connection is closed on exception)
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as smtpserver:
                smtpserver.ehlo()
                smtpserver.starttls()
                smtpserver.ehlo()
                smtpserver.login(self.sender, self.password)
                smtpserver.sendmail(self.sender, recipients, msg.as_string())
            
            logger.info(f"Email sent successfully to {len(recipients)} recipients: {', '.join(recipients)}")
            return True
            
        except smtplib.SMTPException as e:
            logger.error(f"SMTP error sending email: {e}")
            return False
        except Exception as e:
            logger.error(f"Error sending email: {e}")
            return False
    
    def send_simple_email(self, recipients: List[str], subject: str, 
                         body: str, is_html: bool = False) -> bool:
        """Send a simple text or HTML email via SMTP"""
        if not self.sender or not self.password:
            logger.error("Email sender credentials not set")
            return False
        if not recipients:
            logger.error("No recipients specified")
            return False
        
        try:
            msg = MIMEText(body, 'html' if is_html else 'plain')
            msg['Subject'] = subject
            msg['From'] = self.sender
            msg['To'] = ", ".join(recipients)
            
            # Connect to SMTP server and send email (context manager ensures connection is closed on exception)
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as smtpserver:
                smtpserver.ehlo()
                smtpserver.starttls()
                smtpserver.ehlo()
                smtpserver.login(self.sender, self.password)
                smtpserver.sendmail(self.sender, recipients, msg.as_string())
            
            logger.info(f"Email sent successfully to {', '.join(recipients)}")
            return True
            
        except smtplib.SMTPException as e:
            logger.error(f"SMTP error sending email: {e}")
            return False
        except Exception as e:
            logger.error(f"Error sending email: {e}")
            return False


def get_email_sender_from_config(config_path: str = "config/report_config.yaml") -> Optional[EmailSender]:
    """
    Create EmailSender from report config
    
    Args:
        config_path: Path to configuration file
    
    Returns:
        EmailSender instance or None if configuration not found
    """
    try:
        import yaml
        config_file = Path(config_path)
        if not config_file.exists():
            logger.warning(f"Config file not found: {config_path}")
            return None
        
        with open(config_file, 'r') as f:
            config = yaml.safe_load(f)
        
        email_config = config.get('email', {})
        smtp_server = email_config.get('smtp_server', 'smtp.office365.com')
        smtp_port = int(email_config.get('smtp_port', 587))
        return EmailSender(smtp_server, smtp_port, email_config.get('sender'), os.getenv('EMAIL_PASSWORD') or email_config.get('password'))
        
    except Exception as e:
        logger.error(f"Error creating email sender from config: {e}")
        return None
