# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

import pytest
import logging
import time
from pytest_bdd import scenarios, given, when, then, parsers
from utils.mailosaur_helper import generate_email, get_verification_code
from utils.common_utils import normalize_input

logger = logging.getLogger(__name__)
pytestmark = pytest.mark.regression

scenarios('forgot_password.feature')


@given("user navigates to forgot password screen")
def navigate_to_forgot_password(helper):
    helper.login.click("forgot_password_button")


def _resolve_email(email: str, registered_user_resolver) -> str:
    if email.startswith("registered user"):
        return registered_user_resolver(email)
    if email == "unregistered user":
        return generate_email()
    return email


@when(parsers.parse('user requests resets password with "{email}"'))
def request_reset_password(helper, email, registered_user_resolver):
    resolved_email = _resolve_email(normalize_input(email), registered_user_resolver)
    helper.forgot_password.perform_forgot_password_reset(resolved_email)
    helper.forgot_password.last_reset_email = resolved_email


@then(parsers.parse('user should see forgot password toast with title "{title}" and message "{message}"'))
def should_see_forgot_password_toast(helper, title, message):
    toast_title, toast_message = helper.forgot_password.get_toast_title_and_message(timeout=5, poll=0.25)
    if toast_title and toast_message:
        assert toast_title == title, f"Expected toast title: {title} but found: {toast_title}"
        if message:
            assert toast_message == message, f"Expected toast message: {message} but found: {toast_message}"
    elif toast_title and not toast_message:
        assert toast_title == title, f"Expected toast title: {title} but found: {toast_title}"
        assert message == "", f"Expected toast message but found empty: {toast_message}"
    else:
        assert False, "Toast element not found"


@then(parsers.parse('user should see title "{title}"'))
def should_see_title(helper, title):
    actual_title = helper.reset_password.get_title_text()
    assert actual_title == title, f"Expected title: {title} but found: {actual_title}"

@then(parsers.parse('user should see forgot password error "{message}"'))
def should_see_forgot_password_error(helper, message):
    error = helper.forgot_password.get_error_message()
    assert error == message, f"Expected error message: {message} but found: {error}"


@when(parsers.parse('user enters verification code "{code}"'))
def enter_verification_code(helper, code):
    if code == "correct":
        email = getattr(helper.forgot_password, "last_reset_email", None)
        assert email, "No reset email stored. Request reset code first."
        code = get_verification_code(email)
    helper.reset_password.send_keys("code_input", code, clear_first=True)
    helper.reset_password.hide_keyboard_if_visible()


@when(parsers.parse('user enters new password "{new_password}" and confirm password "{confirm_password}"'))
def enter_new_passwords(helper, new_password, confirm_password, registered_user_password_resolver):
    resolved_new = registered_user_password_resolver(normalize_input(new_password))
    resolved_confirm = registered_user_password_resolver(normalize_input(confirm_password))
    helper.reset_password.send_keys("new_password_input", resolved_new)
    helper.reset_password.send_keys("confirm_password_input", resolved_confirm)


@when(parsers.parse('user taps "{button_name}"'))
def tap_button(helper, button_name):
    if button_name == "confirm":
        helper.reset_password.click("confirm_button")
    elif button_name == "resend":
        helper.reset_password.click("resend_button")
    elif button_name == "send code":
        helper.forgot_password.click("send_code_button")
    else:
        raise AssertionError(f"Unsupported button: {button_name}")


@then("user should land on the reset password page")
def should_land_on_reset_password(helper):
    assert helper.reset_password.check_screen_displayed(), "Reset password screen is not displayed"
