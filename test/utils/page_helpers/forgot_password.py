# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Forgot Password Page Helper
"""
import logging
import time
from .base import BasePage
from utils.mailosaur_helper import generate_email
from utils.registered_user_resolver import resolve_registered_user_email

logger = logging.getLogger(__name__)

class ForgotPassword(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)

    def check_screen_displayed(self, timeout=2):
        """Check if forgot password screen is displayed"""
        try:
            return self.is_visible("send_code_button", timeout=timeout)
        except Exception as e:
            logger.warning(f"Forgot password screen not displayed: {e}")
            return False
    
    def perform_forgot_password_reset(self, email: str, wait_for_completion=True):
        """Complete forgot password flow with credentials"""
        logger.info(f"Performing password reset for: {email}")
                
        # Resolve "registered user" / "registered user N" to existing account email
        if email == "registered user" or (isinstance(email, str) and email.startswith("registered user")):
            email = resolve_registered_user_email(email)
            logger.info(f"Resolved to existing account: {email}")
        # Handle dynamic email generation for "new user" placeholder (unregistered email).
        if email == "new user":
            try:
                email = generate_email()
                logger.info(f"Generated new test email for password reset: {email}")
                # Store generated email for later use in verification
                self.generated_email = email
            except Exception as e:
                logger.error(f"Failed to generate new email: {e}")
                raise Exception("Failed to generate new user email for testing")
                
        self.send_keys("email_input", email)
        self.hide_keyboard_if_visible()
        return self
        
    def go_back(self):
        """Go back to previous screen"""
        logger.info("Going back to previous screen")
        self.click("back_button")
        return self
    
    def validate_screen_elements(self):
        """Validate all expected elements are present on forgot password screen"""
        logger.info("Validating forgot password screen elements")
        
        required_elements = [
            "email_input",
            "send_code_button"
        ]
        
        missing_elements = []
        for element in required_elements:
            if not self.is_visible(element, timeout=5):
                missing_elements.append(element)
        
        if missing_elements:
            raise Exception(f"Missing forgot password screen elements: {missing_elements}")
        
        logger.info("All forgot password screen elements validated successfully")
        return True
