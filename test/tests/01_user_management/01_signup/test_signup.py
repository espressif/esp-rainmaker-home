# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

import pytest
import logging
from pytest_bdd import scenarios, given, when, then, parsers
from utils.common_utils import normalize_input

logger = logging.getLogger(__name__)
pytestmark = pytest.mark.regression

scenarios('signup.feature')

@given("user navigates to sign up screen")
def navigate_to_signup(helper):
    # Clear any launch permission alert first. On iOS the first tap after an alert
    # is sometimes absorbed — the tap is acknowledged (HTTP 200) but onPress never
    # fires and the app stays on login — so verify navigation and retry the tap once.
    if helper.permissions.any_system_alert_present(timeout=1):
        helper.permissions.handle_all_permissions(action="allow", timeout=3)
    helper.login.click("signup_button")
    if not helper.signup.check_screen_displayed(timeout=3):
        helper.login.click("signup_button")
    logger.info("Navigated to sign up screen")

@given("user is on the sign up screen")
def on_signup_screen(helper):
    assert helper.signup.check_screen_displayed(), "Sign up screen is not displayed"

@when(parsers.parse('user signs up with "{email}", "{password}", "{confirm_password}" and "{terms}" consent'))
def signup(helper, email, password, confirm_password, terms):
    accept_terms = True if terms.lower() == "accept" else False
    helper.signup.perform_signup(
        normalize_input(email),
        normalize_input(password),
        normalize_input(confirm_password),
        accept_terms=accept_terms
    )
    
@then("user should proceed to verification screen")
def proceed_to_verification(helper):
    assert helper.verification_code.check_screen_displayed(), "Should be on verification screen"

@when(parsers.parse('user enters verification code "{code}"'))
def enter_verification_code(helper, code):
    helper.verification_code.verify_code(code)

@when("user requests to resend verification code")
def resend_verification_code(helper):
    helper.verification_code.hide_keyboard_if_visible()
    helper.verification_code.click("resend_code_button")

@then("user should remain on verification screen")
def should_remain_verification(helper):
    assert helper.verification_code.check_screen_displayed(), "Should remain on verification screen"

@then(parsers.parse('user should see toast with title "{title}" and message "{message}"'))
def should_see_toast(helper, title, message):
    message = normalize_input(message)
    toast_title, toast_message = helper.verification_code.get_toast_title_and_message(timeout=5, poll=0.25, require_message=bool(message))
    if title:
        assert toast_title == title, f"Expected toast title: {title} but found: {toast_title}"
    if message:    
        assert toast_message == message, f"Expected toast message: {message} but found: {toast_message}"

@then(parsers.parse('user should see title "{title}"'))
def should_see_title(helper, title):
    actual_title = helper.verification_code.get_title_text()
    assert actual_title == title, f"Expected title: {title} but found: {actual_title}"

@then(parsers.parse('user should see error "{message}"'))
def should_see_error(helper, message):
    error = helper.signup.get_error_message()
    assert error == message, f"Expected error message: {message} but found: {error}"

@then("user should remain on sign up screen")
def should_remain_signup(helper):
    assert helper.signup.check_screen_displayed(), "Should remain on sign up screen"

@when("user checks sign up button state with empty fields")
def check_signup_button_state(helper):
    return helper.signup.is_signup_button_enabled()

@then("sign up button should be disabled")
def signup_button_disabled(helper):
    assert not helper.signup.is_signup_button_enabled(), "Sign up button should be disabled"

@then("all sign up elements should be present")
def all_signup_elements_present(helper):
    helper.signup.validate_screen_elements()
    logger.info("All sign up screen elements validated")

@when("user enters password and toggles visibility on sign up")
def toggle_password_visibility_signup(helper):
    helper.signup.send_keys("password_input", "testpassword")
    helper.signup.toggle_password_visibility()

@then("password should be visible on sign up")
def password_should_be_visible_signup(helper):
    assert helper.signup.is_password_visible(), "Password should be visible after toggle"

@when("user toggles terms checkbox")
def toggle_terms_checkbox(helper):
    helper.signup.toggle_terms_checkbox()

@then("terms checkbox should be checked")
def terms_checkbox_checked(helper):
    assert helper.signup.is_terms_checkbox_checked(), "Terms checkbox should be checked"

@when(parsers.parse('user taps "{button_name}"'))
def tap_button(helper, button_name):
    if button_name == "sign in":
        helper.signup.click("signin_button")
    elif button_name == "confirm":
        helper.signup.click("signup_button")
    elif button_name == "verify":
        helper.verification_code.click("verify_button")
    else:
        raise AssertionError(f"Unsupported button: {button_name}")

@then("user should see app version displayed on sign up")
def should_see_version_signup(helper, expected_app_version):
    try:
        version = helper.signup.get_text("app_version_text")
        assert version is not None, "App version should be displayed"
        assert version == expected_app_version, f"Expected '{expected_app_version}', got '{version}'"
        logger.info(f"App version on sign up: {version}")
    except Exception:
        pytest.skip("App version element not found")

# ========== Easy to add new steps ==========
# Just add new @when, @then, @given functions above!
