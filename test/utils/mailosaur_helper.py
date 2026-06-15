# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Mailosaur Email Utility for Test Automation
Handles email generation and verification code extraction.
Config loaded from config/deployment.yaml under 'mailosaur' key.
"""
import os
import uuid
import re
import logging
import traceback
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

try:
    from mailosaur import MailosaurClient
    from mailosaur.models import SearchCriteria
    from pytz import timezone
except ImportError:
    MailosaurClient = None
    SearchCriteria = None
    timezone = None

logger = logging.getLogger(__name__)

_CONFIG_PATH = Path(__file__).resolve().parents[1] / "config" / "deployment.yaml"


def _load_mailosaur_config() -> dict:
    """
    Load Mailosaur config from env vars / deployment.yaml (gitignored).

    The account identifiers (server id, domain) are environment-specific and
    are not hard-coded here so they stay out of source control.
    """
    try:
        import yaml
        if _CONFIG_PATH.exists():
            with open(_CONFIG_PATH, "r") as f:
                config = yaml.safe_load(f) or {}
            mailosaur = config.get("mailosaur", {})
            return {
                "api_key": os.getenv("MAILOSAUR_API_KEY") or mailosaur.get("api_key", ""),
                "server_id": os.getenv("MAILOSAUR_SERVER_ID") or mailosaur.get("server_id", ""),
                "domain": os.getenv("MAILOSAUR_DOMAIN") or mailosaur.get("domain", ""),
            }
    except Exception as e:
        logger.warning(f"Could not load mailosaur config: {e}")
    return {
        "api_key": os.getenv("MAILOSAUR_API_KEY", ""),
        "server_id": os.getenv("MAILOSAUR_SERVER_ID", ""),
        "domain": os.getenv("MAILOSAUR_DOMAIN", ""),
    }


class MailosaurHelper:
    """
    Mailosaur helper for email generation and verification code extraction.
    Configuration from config/deployment.yaml (mailosaur section).
    """

    def __init__(self):
        cfg = _load_mailosaur_config()
        self._api_key = cfg["api_key"]
        self._server_id = cfg["server_id"]
        self._domain = cfg["domain"]
        if not MailosaurClient:
            logger.error("Mailosaur dependencies not installed. Run: pip install mailosaur pytz")
            self.client = None
        elif not self._api_key:
            logger.error("Mailosaur API key not configured. Set MAILOSAUR_API_KEY or add to config/deployment.yaml")
            self.client = None
        else:
            self.client = MailosaurClient(self._api_key)
    
    def generate_email(self) -> str:
        """
        Generate unique mailosaur email address for testing
        
        Returns:
            str: Generated email address (e.g., "uuid@example.mailosaur.net")
            
        Raises:
            Exception: If email generation fails
        """
        try:
            unique_id = str(uuid.uuid4())
            email = f"{unique_id}@{self._domain}"
            logger.info(f"Generated test email: {email}")
            return email
        except Exception as e:
            logger.error(f"Failed to generate email: {e}")
            raise Exception("Failed to generate Email id. Cannot run test!")
    
    def get_verification_code(self, email_id: str, timeout_minutes: int = 2,
                            pattern: str = r"\w+\s+(\d+)",
                            subject_contains: str = None) -> str:
        """
        Extract verification code from email received within specified timeout
        
        Args:
            email_id (str): Email address to check (must be @example.mailosaur.net)
            timeout_minutes (int): How far back to search for emails (default: 2 minutes)
            pattern (str): Regex pattern to extract verification code
            subject_contains (str): Optional subject filter to match specific email type
                                   (e.g. "delete" for delete-account verification)
            
        Returns:
            str: Extracted verification code
            
        Raises:
            Exception: If verification code not found or mailosaur client unavailable
        """
        if not self.client:
            raise Exception("Mailosaur client not available. Check dependencies.")
            
        if not email_id.endswith(self._domain):
            raise Exception(f"Email must be from domain {self._domain}")
        
        try:
            logger.info(f"Searching for verification email sent to: {email_id}"
                       + (f" (subject contains: {subject_contains})" if subject_contains else ""))
            
            # Set up search criteria
            criteria = SearchCriteria()
            criteria.sent_to = email_id
            if subject_contains:
                criteria.subject = subject_contains
            
            # Search for emails received in the last N minutes
            utc = timezone("UTC")
            search_from = datetime.now(utc) - timedelta(minutes=timeout_minutes)
            
            # Get the email
            email = self.client.messages.get(
                self._server_id,
                criteria,
                received_after=search_from
            )
            
            if not email or not email.html or not email.html.body:
                raise Exception("No email found or email body is empty")
            
            # Clean email body and extract verification code
            email_body = self._clean_email_body(email.html.body)
            verification_code = self._extract_code(email_body, pattern)
            
            logger.info(f"Successfully extracted verification code: {verification_code}")
            return verification_code
            
        except IndexError:
            logger.error(f"Verification code pattern not found in email body")
            raise Exception("Verification code not found in email")
        except Exception as e:
            logger.error(f"Error retrieving verification code: {traceback.format_exc()}")
            raise Exception(f"Failed to get verification code: {str(e)}")
    
    def _clean_email_body(self, html_body: str) -> str:
        """
        Clean HTML email body by removing tags and normalizing whitespace
        
        Args:
            html_body (str): Raw HTML email body
            
        Returns:
            str: Cleaned text content
        """
        # Remove HTML tags
        clean_text = re.sub(r"<[^>]+>", "", html_body)
        # Remove newlines
        clean_text = re.sub(r"\n", "", clean_text)
        # Normalize whitespace
        clean_text = re.sub(r"\s+", " ", clean_text)
        return clean_text.strip()
    
    def _extract_code(self, email_body: str, pattern: str) -> str:
        """
        Extract verification code using regex pattern
        
        Args:
            email_body (str): Cleaned email body text
            pattern (str): Regex pattern to match verification code
            
        Returns:
            str: Extracted verification code
            
        Raises:
            IndexError: If pattern doesn't match
        """
        matches = re.findall(pattern, email_body)
        if not matches:
            # Try alternative patterns for different email formats
            alternative_patterns = [
                r"(\d{6})",  # 6 digit code
                r"code:\s*(\d+)",  # "code: 123456"
                r"verification.*?(\d{4,8})",  # "verification code 123456"
                r"(\d{4,8})"  # Any 4-8 digit number
            ]
            
            for alt_pattern in alternative_patterns:
                matches = re.findall(alt_pattern, email_body, re.IGNORECASE)
                if matches:
                    logger.info(f"Found code using alternative pattern: {alt_pattern}")
                    break
            
            if not matches:
                raise IndexError("No verification code found with any pattern")
        
        return matches[0]
    
    def wait_for_email(self, email_id: str, subject_contains: str = None, 
                      max_wait_seconds: int = 60) -> bool:
        """
        Wait for email to arrive within specified time
        
        Args:
            email_id (str): Email address to monitor
            subject_contains (str): Optional subject filter
            max_wait_seconds (int): Maximum time to wait
            
        Returns:
            bool: True if email received, False if timeout
        """
        import time
        
        if not self.client:
            return False
            
        start_time = time.time()
        
        while time.time() - start_time < max_wait_seconds:
            try:
                criteria = SearchCriteria()
                criteria.sent_to = email_id
                if subject_contains:
                    criteria.subject = subject_contains
                
                utc = timezone("UTC")
                search_from = datetime.now(utc) - timedelta(seconds=max_wait_seconds)
                
                email = self.client.messages.get(
                    self._server_id,
                    criteria,
                    received_after=search_from
                )
                
                if email:
                    logger.info(f"Email received for {email_id}")
                    return True
                    
            except Exception:
                pass  # Continue waiting
            
            time.sleep(2)  # Check every 2 seconds
        
        logger.warning(f"Timeout waiting for email to {email_id}")
        return False


# Global instance for easy access
mailosaur_helper = MailosaurHelper()


_DELETE_ACCOUNT_SUBJECT = "Delete Request" 

# Convenience functions for backward compatibility
def generate_email() -> str:
    """Generate unique test email address"""
    return mailosaur_helper.generate_email()


def get_verification_code(email_id: str, timeout_minutes: int = 2,
                          subject_contains: str = None) -> str:
    """Get verification code from email"""
    return mailosaur_helper.get_verification_code(
        email_id, timeout_minutes, subject_contains=subject_contains
    )


def get_delete_account_verification_code(email_id: str, max_wait_seconds: int = 60) -> str:
    """
    Wait for delete-account verification email and extract code.
    Uses subject filter to avoid picking up signup OTP when both emails exist.
    """
    if not mailosaur_helper.client:
        raise Exception("Mailosaur client not available. Check dependencies.")
    if not mailosaur_helper.wait_for_email(
        email_id, subject_contains=_DELETE_ACCOUNT_SUBJECT, max_wait_seconds=max_wait_seconds
    ):
        raise Exception(
            f"Delete account verification email not received within {max_wait_seconds}s. "
            f"Check subject contains '{_DELETE_ACCOUNT_SUBJECT}'."
        )
    return mailosaur_helper.get_verification_code(
        email_id, timeout_minutes=2, subject_contains=_DELETE_ACCOUNT_SUBJECT
    )
