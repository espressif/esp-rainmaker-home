# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Simple BDD Login Tests - Add scenarios by just adding functions
"""
import pytest
import logging
from pytest_bdd import scenarios, given, when, then, parsers

from utils.app_copy import resolve_server_copy
from utils.registered_user_resolver import deployment_type

logger = logging.getLogger(__name__)
pytestmark = pytest.mark.regression

scenarios('login.feature')

@when("user check login button state")
def check_button_state(helper):
    return helper.login.is_login_button_enabled()

@when(parsers.parse('user taps "{button_name}"'))
def tap_button(helper, button_name):
    if button_name == "forgot password":
        helper.login.click("forgot_password_button")
    elif button_name == "sign up":
        helper.login.click("signup_button")

@when("user enter password and toggle visibility")
def toggle_password_visibility(helper):
    helper.login.send_keys("password_input", "testpassword")
    helper.login.click("password_toggle")

@then("user should land on forgot password screen")
def land_on_forgot_password(helper):
    assert helper.forgot_password.check_screen_displayed(), "Should be on forgot password screen"

@then("user should land on sign up screen")
def land_on_signup(helper):
    assert helper.signup.check_screen_displayed(), "Should be on sign up screen"

@then(parsers.parse('user should see error "{message}"'))
def should_see_error(helper, message):
    error = helper.login.get_error_message()
    assert error == message, f"Expected error message: {message} but found: {error}"

@then(parsers.parse('user should see toast with title "{title}" and message "{message}"'))
def should_see_toast_error(helper, title, message, pytestconfig):
    message = resolve_server_copy(pytestconfig.getoption("--deployment"), message)
    actual_title, actual_message = helper.login.get_toast_title_and_message(timeout=10, poll=0.25)
    if actual_message == "Network request failed":
        # Phone-side fetch blip, not the backend response under test: re-submit the filled form once.
        logger.info("RETRY wrong-password submit: transient network failure toast, re-submitting once")
        helper.login.click("login_button", timeout=5)
        actual_title, actual_message = helper.login.get_toast_title_and_message(timeout=10, poll=0.25)
    assert actual_title == title, f"Expected error title: {title} but found: {actual_title}"
    assert actual_message == message, f"Expected error message: {message} but found: {actual_message}"

@then("login button should be disabled")
def button_disabled(helper):
    assert not helper.login.is_login_button_enabled(), "Login button should be disabled"

@then("all elements should be present")
def all_elements_present(helper, pytestconfig):
    include_third_party = deployment_type(pytestconfig.getoption("--deployment")) != "rmneo"
    helper.login.validate_screen_elements(include_third_party=include_third_party)
    logger.info("All login screen elements validated")

@then("user should see app version displayed")
def should_see_version(helper, expected_app_version):
    version = helper.login.get_text("app_version_text", timeout=10)
    assert version, "App version text is not displayed on the login screen"
    assert expected_app_version in version, f"Expected '{expected_app_version}' within displayed text, got '{version}'"
    logger.info(f"App version: {version}")

@then("password should be visible")
def password_should_be_visible(helper):
    assert helper.login.is_password_visible(), "Password should be visible after toggle"
