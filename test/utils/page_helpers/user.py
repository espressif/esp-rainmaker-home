# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
User Profile Page Helper
"""
import logging
import time
from .base import BasePage

logger = logging.getLogger(__name__)

class User(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)
    
    def perform_logout(self, wait_for_login_screen=True):
        """
        Complete logout flow:
        1. Click logout button
        2. Wait for confirmation dialog
        3. Confirm logout
        4. Verify navigation to login screen
        
        Args:
            wait_for_login_screen: If True, waits and verifies login screen appears
        
        Returns:
            self for method chaining
        """
        logger.info("Performing logout")

        perms = self.get_other_page_helper('permissions')
        if perms.any_system_alert_present(timeout=1):
            perms.handle_all_permissions(action="allow", timeout=3)
        self.click("logout_button")
        self.click("alert_confirm_button")
        
        # Wait for login screen if requested
        if wait_for_login_screen:
            login_helper = self.get_other_page_helper('login')
            if not login_helper.check_screen_displayed(timeout=15):
                raise Exception("Login screen did not appear after logout")
            logger.info("Successfully logged out and navigated to login screen")
        
        return self
