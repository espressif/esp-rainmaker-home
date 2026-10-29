# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Sign Up Page Helper
"""
import logging
import time
from .base import PasswordFormPage
from utils.mailosaur_helper import generate_email

logger = logging.getLogger(__name__)

class Signup(PasswordFormPage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)

    def is_confirm_password_visible(self):
        """Check if confirm password is currently visible as text"""
        try:
            # Check if confirm password field shows actual text vs masked
            password_text = self.get_text("confirm_password_input")
            return not all(char == '•' or char == '*' for char in password_text if char)
        except Exception:
            return False
    
    def is_signup_button_enabled(self):
        """Check if signup button is enabled"""
        try:
            return self.is_enabled("signup_button")
        except Exception:
            return False
    
    def is_terms_checkbox_checked(self):
        """Check if terms and privacy checkbox is checked"""
        try:
            element = self.find_element("terms_checkbox")
            # For Android, check the checked attribute
            if self.platform.lower() == "android":
                print(element.get_attribute("checked"))
                return element.get_attribute("checked") == "true"
            # For iOS, check the value attribute
            else:
                return element.get_attribute("value") == "1"
        except Exception:
            return False
    
    def toggle_terms_checkbox(self):
        """Toggle the terms and privacy checkbox"""
        logger.info("Toggling terms and privacy checkbox")
        self.click("terms_checkbox")
        return self
    
    
    def perform_signup(self, email: str, password: str, confirm_password: str, accept_terms=True, wait_for_completion=True):
        """Complete signup flow with credentials"""
        logger.info(f"Performing signup for: {email}")
        
        if not self.check_screen_displayed():
            raise Exception("Not on signup screen")

        if email == "new user":
            try:
                email = generate_email()
                logger.info(f"Generated new test email: {email}")
                self.generated_email = email
            except Exception as e:
                logger.error(f"Failed to generate new email: {e}")
                raise Exception("Failed to generate new user email for testing")
        
        self.send_keys("email_input", email)
        self.send_keys("password_input", password)
        self.send_keys("confirm_password_input", confirm_password)
        
        self.hide_keyboard_if_visible()
        
        current_checkbox_state = self.is_terms_checkbox_checked()
        if accept_terms and not current_checkbox_state:
            logger.info("Accepting terms and conditions")
            self.toggle_terms_checkbox()
        elif not accept_terms and current_checkbox_state:
            logger.info("Rejecting terms and conditions") 
            self.toggle_terms_checkbox()
        
        return self    
    
    def navigate_to_signin(self):
        """Navigate to sign in screen"""
        logger.info("Navigating to sign in screen")
        self.click("signin_button")
        return self
    
    def validate_screen_elements(self):
        """Validate all expected elements are present on signup screen"""
        logger.info("Validating signup screen elements")
        
        required_elements = [
            "logo",
            "email_input",
            "password_input", 
            "confirm_password_input",
            "terms_checkbox",
            "terms_text",
            "signup_button",
            "signin_button"
        ]
        
        missing_elements = []
        for element in required_elements:
            if not self.is_visible(element, timeout=5):
                missing_elements.append(element)
        
        if missing_elements:
            raise Exception(f"Missing signup screen elements: {missing_elements}")
        
        logger.info("All signup screen elements validated successfully")
        return True
