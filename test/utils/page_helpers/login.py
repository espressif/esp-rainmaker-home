# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Login Page Helper."""
import logging
import time
from .base import BasePage

logger = logging.getLogger(__name__)

POST_PLATFORM_PICK_TIMEOUT = 60

class Login(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)
        self.platform_kind = "rm"
    
    def check_screen_displayed(self, timeout=2):
        """Check if login screen is displayed"""
        try:
            return (self.is_visible("login_button", timeout=timeout, poll=0.2))
        except Exception as e:
            logger.warning(f"Login screen not displayed: {e}")
            return False

    def dismiss_landing_if_shown(self, platform_kind=None, timeout=90):
        """Pick the deployment's platform on the landing screen (rm -> Classic, rmneo -> Neo); polls the first-launch splash until landing, login or home settles.

        Returns True once the landing state is settled (platform picked, or login/home already
        showing because the persisted selection skipped landing) and False when the app never
        settled within `timeout`.
        """
        if platform_kind:
            self.platform_kind = platform_kind
        perms = self.get_other_page_helper('permissions')
        home = self.get_other_page_helper('home')
        landing_shown = False
        deadline = time.time() + timeout
        while time.time() < deadline:
            if perms.any_system_alert_present(timeout=1):
                perms.handle_all_permissions(action="allow", timeout=3)
            if self.is_visible("landing_view", timeout=1):
                landing_shown = True
                break
            if self.check_screen_displayed(timeout=1) or home.check_screen_displayed(timeout=1):
                return True
        if not landing_shown:
            logger.warning("Neither landing nor login/home settled in %ss; landing stays unhandled", timeout)
            return False
        option = "neo_platform_button" if self.platform_kind == "rmneo" else "classic_platform_button"
        logger.info("Landing screen shown; selecting platform via %s", option)
        self.click(option, timeout=5)
        deadline = time.time() + POST_PLATFORM_PICK_TIMEOUT
        while time.time() < deadline:
            if perms.any_system_alert_present(timeout=1):
                perms.handle_all_permissions(action="allow", timeout=3)
            if self.check_screen_displayed(timeout=2):
                return True
            if self.is_visible("landing_view", timeout=1):
                self.click(option, timeout=5)
        raise AssertionError("Login screen did not appear after selecting the landing platform")
    
        
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
        logger.info(f"Performing login for: {email}")
        
        if not self.check_screen_displayed():
            raise Exception("Not on login screen")

        perms = self.get_other_page_helper('permissions')
        if perms.any_system_alert_present(timeout=1):
            logger.info("Dismissing a system alert before entering credentials")
            perms.handle_all_permissions(action="allow", timeout=3)

        self.send_keys("email_input", email)
        self.send_keys("password_input", password)
        if perms.any_system_alert_present(timeout=1):
            perms.handle_all_permissions(action="allow", timeout=3)
            self.send_keys("email_input", email, clear_first=True)
            self.send_keys("password_input", password, clear_first=True)
        self.hide_keyboard_if_visible()
        if self.is_login_button_enabled():
            self.click("login_button")
        else:
            # iOS keyboard can cover Sign-in (displayed=false); password field returnKeyType=go submits via onSubmitEditing
            logger.warning("Login button not clickable; submitting via password return key")
            self.send_keys("password_input", "\n")
            if self.is_login_button_enabled():
                self.click("login_button")

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

    def ensure_login_screen(self, force_logout=False):
        """Reach (or record) the login screen; force_logout logs out now, else defers it for session reuse."""
        perms = self.get_other_page_helper('permissions')
        # Fresh installs raise permission dialogs in waves; drain them before login.
        perms.drain_system_alerts()
        home = self.get_other_page_helper('home')

        def _settle(timeout_s):
            end = time.time() + timeout_s
            while time.time() < end:
                # Clear any permission dialog that pops while the app settles.
                if perms.any_system_alert_present(timeout=1):
                    perms.handle_all_permissions(action="allow", timeout=2)
                if self.check_screen_displayed(timeout=1):
                    return "login"
                if home.check_screen_displayed(timeout=1):
                    return "home"
                time.sleep(0.5)
            return "stuck"

        state = _settle(20)
        if state == "stuck":
            # A failed prior run can leave the app mid-flow; restart it for a clean state.
            bundle = self.driver.capabilities.get("bundleId") or self.driver.capabilities.get("appPackage") or "com.espressif.nova"
            logger.warning("Neither login nor home visible after 20s; restarting %s", bundle)
            try:
                self.driver.terminate_app(bundle)
                time.sleep(2)
                self.driver.activate_app(bundle)
            except Exception as error:
                logger.warning("App restart failed: %s", error)
            if perms.any_system_alert_present(timeout=1):
                perms.handle_all_permissions(action="allow", timeout=3)
            state = _settle(25)
        logged_in = state == "home"
        if logged_in and force_logout:
            self.logout_to_login_screen()
            self.logged_in_on_entry = False
        else:
            self.logged_in_on_entry = logged_in
        return self

    def logout_to_login_screen(self):
        """Log out from the home/user screen back to the login screen (for a fresh login)."""
        logger.info("Logging out to reach the login screen")
        home_page = self.get_other_page_helper('home')
        user_page = self.get_other_page_helper('user')
        if home_page.check_screen_displayed(timeout=2, poll=0.2):
            home_page.click("user_button")
            user_page.perform_logout(wait_for_login_screen=True)
        elif user_page.check_screen_displayed(timeout=2):
            user_page.perform_logout(wait_for_login_screen=True)
        assert self.check_screen_displayed(timeout=7), "Login screen is not displayed"
        return self