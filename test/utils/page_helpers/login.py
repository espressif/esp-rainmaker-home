# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Login Page Helper
"""
import logging
import time
from .base import BasePage

logger = logging.getLogger(__name__)

class Login(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)
    
    def check_screen_displayed(self, timeout=2):
        """Check if login screen is displayed"""
        try:
            return (self.is_visible("login_button", timeout=timeout, poll=0.2))
        except Exception as e:
            logger.warning(f"Login screen not displayed: {e}")
            return False
    
        
    def is_password_visible(self):
        """Check if password is currently visible as text"""
        try:
            # Check if password field shows actual text vs masked
            password_text = self.get_text("password_input")
            return not all(char == '•' or char == '*' for char in password_text if char)
        except Exception:
            return False
    
    def is_login_button_enabled(self):
        """Check if login button is enabled"""
        try:
            return self.is_enabled("login_button")
        except Exception:
            return False
    
    def perform_login(self, email: str, password: str, wait_for_completion=True):
        """Complete login flow with credentials"""
        logger.info(f"Performing login for: {email} with {password}")
        
        if not self.check_screen_displayed():
            raise Exception("Not on login screen")
        
        self.send_keys("email_input", email)
        self.send_keys("password_input", password)
        if self.is_login_button_enabled():
            self.click("login_button")
        else:
            logger.warning("Login button not enabled")
        
        return self
    
    def validate_screen_elements(self):
        """Validate all expected elements are present on login screen"""
        logger.info("Validating login screen elements")
        
        required_elements = [
            "logo",
            "email_input",
            "password_input", 
            "login_button",
            "forgot_password_button",
            "signup_button",
            "3p_login_text",
            "google_login_button",
            "logo_google",
            "apple_login_button",
            "logo_apple",
            "app_version_text"
        ]
        
        missing_elements = []
        for element in required_elements:
            if not self.is_visible(element, timeout=5):
                missing_elements.append(element)
        
        if missing_elements:
            raise Exception(f"Missing login screen elements: {missing_elements}")
        
        logger.info("All login screen elements validated successfully")
        return True

    def ensure_login_screen(self):
        # A leftover system alert (e.g. a SoftAP "Join Wi-Fi" prompt from a prior
        # run) can sit on top of the app and block every interaction; clear it
        # before deciding which screen we're on.
        perms = self.get_other_page_helper('permissions')
        if perms.any_system_alert_present(timeout=1):
            logger.info("Dismissing a stale system alert before login")
            perms.handle_all_permissions(action="allow", timeout=3)
        if self.check_screen_displayed(timeout=2):
            return self
        logger.info("App opened to home/user screen (session persisted); navigating to login via logout")
        home_page = self.get_other_page_helper('home')
        user_page = self.get_other_page_helper('user')
        if home_page.check_screen_displayed(timeout=2, poll=0.2):
            home_page.click("user_button")
            user_page.perform_logout(wait_for_login_screen=True)
        elif user_page.check_screen_displayed(timeout=2):
            user_page.perform_logout(wait_for_login_screen=True)
        assert self.check_screen_displayed(timeout=7), "Login screen is not displayed"
        return self