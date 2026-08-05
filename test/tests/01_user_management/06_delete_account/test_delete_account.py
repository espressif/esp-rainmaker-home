# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

import pytest
import logging
import time
from pytest_bdd import scenarios, given, when, then, parsers
from utils.api_user_helper import ApiUserHelper
from utils.mailosaur_helper import get_delete_account_verification_code
from utils.registered_user_resolver import load_deployment_config
from utils.common_utils import normalize_input

logger = logging.getLogger(__name__)
pytestmark = [pytest.mark.regression, pytest.mark.user_management, pytest.mark.delete_account]

scenarios('delete_account.feature')


def _create_temp_user(pytestconfig) -> dict:
    deployment = pytestconfig.getoption("--deployment")
    config = load_deployment_config(deployment)
    env_config = config.get(deployment, {})
    base_uri = env_config.get("uri")
    password = env_config.get("password", "Welcome@01")
    if not base_uri:
        raise ValueError(f"Missing 'uri' for deployment '{deployment}' in config/deployment.yaml")
    helper = ApiUserHelper(base_uri)
    return helper.create_and_confirm_user(password)

@given(parsers.parse('user is on delete account screen for "{user_alias}"'))
def on_delete_account_screen(
    helper,
    user_alias,
    pytestconfig,
    registered_user_resolver,
    registered_user_password_resolver,
):
    if user_alias == "new user":
        temp_user = _create_temp_user(pytestconfig)
        email = temp_user["email"]
        password = temp_user["password"]
    else:
        email = registered_user_resolver(user_alias)
        password = registered_user_password_resolver(f"{user_alias} password")

    helper.login.perform_login(email, password)
    helper.login.last_login_email = email
    helper.delete_account.last_delete_email = email

    assert helper.home.check_screen_displayed(timeout=10), "Home screen is not displayed"
    helper.home.click("user_button")
    helper.user.click("settings_button")
    helper.settings.click("account_security_item")
    helper.account_security.click("delete_account_button")
    assert helper.delete_account.check_screen_displayed(), "Delete account screen is not displayed"


@then(parsers.parse('user should see delete account title "{title}"'))
def should_see_delete_account_title(helper, title):
    actual_title = helper.delete_account.get_text("verification_title")
    assert actual_title == title, f"Expected title: {title} but found: {actual_title}"


@when(parsers.parse('user enters delete account verification code "{code}"'))
def enter_delete_account_code(helper, code):
    if code == "correct":
        email = getattr(helper.delete_account, "last_delete_email", None)
        assert email, "No delete account email stored. Request deletion code first."
        code = get_delete_account_verification_code(email)
    helper.delete_account.send_keys("code_input", code)
    helper.delete_account.hide_keyboard_if_visible()


@when(parsers.parse('user taps "{button_name}"'))
def tap_button(helper, button_name):
    if button_name == "verify delete account":
        helper.delete_account.click("verify_button")
    elif button_name == "resend verification code":
        helper.delete_account.click("resend_button")
    elif button_name == "delete account":
        helper.delete_account.click("delete_account_button")
    else:
        raise AssertionError(f"Unsupported button: {button_name}")


@when("user waits for resend verification code to be enabled")
def wait_for_resend_enabled(helper):
    helper.delete_account.hide_keyboard_if_visible()
    end_time = time.monotonic() + 70
    flag = False
    while time.monotonic() < end_time:
        counter = helper.delete_account.find_visible("resend_counter_text", timeout=1)
        if counter:
            text = (counter.text or "").strip()
            if "(" not in text and text:
                flag = True
                break
        time.sleep(1)
    if not flag:
        raise AssertionError("Counter text still showing after 70 seconds")
    assert helper.delete_account.is_enabled("resend_button", timeout=2), "Resend button should be enabled"

@then("delete account verify button should be disabled")
def verify_button_disabled(helper):
    assert not helper.delete_account.is_enabled("verify_button", timeout=2), "Verify button should be disabled"


@then(parsers.parse('user should see delete account toast with title "{title}" and message "{message}"'))
def should_see_delete_account_toast(helper, title, message):
    message = normalize_input(message)
    toast_title, toast_message = helper.delete_account.get_toast_title_and_message(
        timeout=5,
        poll=0.25,
        require_message=bool(message)
    )
    if title:
        assert toast_title == title, f"Expected toast title: {title} but found: {toast_title}"
    if message:
        assert toast_message == message, f"Expected toast message: {message} but found: {toast_message}"

@when("user should be on verification code page")
def on_verification_code_page(helper):
    assert helper.verification_code.check_screen_displayed(), "Should be on verification screen"
