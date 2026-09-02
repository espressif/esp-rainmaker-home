# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

import pytest
import logging
from pytest_bdd import scenarios, given, when, then, parsers
from utils.registered_user_resolver import update_registered_user_password
from utils.app_copy import resolve_server_copy
from utils.common_utils import normalize_input

logger = logging.getLogger(__name__)
pytestmark = [pytest.mark.regression, pytest.mark.user_management, pytest.mark.change_password]

scenarios('change_password.feature')


def _open_change_password_screen(helper):
    assert helper.home.check_screen_displayed(timeout=10), "Home screen is not displayed"
    helper.home.click("user_button")
    helper.user.click("settings_button")
    try:
        helper.settings.click("account_security_item")
    except Exception:
        # On iOS the first tap on the settings gear is sometimes dropped, leaving
        # the app on the User tab (Settings never opens). Re-open Settings once.
        helper.user.click("settings_button")
        helper.settings.click("account_security_item")
    helper.account_security.click("change_password_button")
    assert helper.change_password.check_screen_displayed(), "Change password screen is not displayed"


@given(parsers.parse('user is on change password screen for "{login_user}"'))
def on_change_password_screen_for_user(helper, login_user, registered_user_password_resolver, registered_user_resolver):
    resolved_email = registered_user_resolver(login_user)
    login_password = registered_user_password_resolver(f"{login_user} password")
    helper.login.perform_login(resolved_email, login_password)
    helper.login.last_login_email = resolved_email
    _open_change_password_screen(helper)

@given("user is on the change password screen")
def on_change_password_screen(helper):
    assert helper.change_password.check_screen_displayed(), "Change password screen is not displayed"


@when(parsers.parse('user enters current password "{old_password}", new password "{new_password}" and confirm password "{confirm_password}"'))
def enter_passwords(helper, old_password, new_password, confirm_password, registered_user_password_resolver):
    resolved_old = registered_user_password_resolver(normalize_input(old_password))
    resolved_new = registered_user_password_resolver(normalize_input(new_password))
    resolved_confirm = registered_user_password_resolver(normalize_input(confirm_password))

    helper.change_password.send_keys("old_password_input", resolved_old)
    helper.change_password.send_keys("new_password_input", resolved_new)
    helper.change_password.send_keys("confirm_password_input", resolved_confirm)
    
    helper.change_password.hide_keyboard_if_visible()
    helper.change_password.last_new_password = resolved_new

@when(parsers.parse('user taps "{button_name}"'))
@given(parsers.parse('user taps "{button_name}"'))
def tap_button(helper, button_name):
    if button_name == "user":
        helper.home.click("user_button")
    elif button_name == "settings":
        helper.user.click("settings_button")
    elif button_name == "account security":
        helper.settings.click("account_security_item")
    elif button_name == "change password":
        helper.account_security.click("change_password_button")
    elif button_name == "update password":
        helper.change_password.click("set_password_button")
    else:
        raise AssertionError(f"Unsupported button: {button_name}")


@then(parsers.parse('user should see toast with title "{title}" and message "{message}"'))
def should_see_toast(helper, title, message, pytestconfig):
    message = resolve_server_copy(pytestconfig.getoption("--deployment"), normalize_input(message))
    toast_title, toast_message = helper.change_password.get_toast_title_and_message(
        timeout=5,
        poll=0.25,
        require_message=bool(message)
    )
    if "success" in (toast_title or "").lower():
        email = getattr(helper.login, "last_login_email", None)
        new_password = getattr(helper.change_password, "last_new_password", None)
        if email and new_password:
            deployment = pytestconfig.getoption("--deployment")
            update_registered_user_password(email, new_password, deployment)
    if title:
        assert (toast_title or "") == title, f"Expected toast title: {title} but found: {toast_title}"
    if message:
        assert toast_message == message, f"Expected toast message: {message} but found: {toast_message}"
    


@then(parsers.parse('user should see error "{message}"'))
def should_see_error(helper, message):
    message = normalize_input(message)
    error = helper.change_password.get_error_message()
    if message:
        assert error == message, f"Expected error: {message} but found: {error}"


@then("update password button should be disabled")
def update_password_button_disabled(helper):
    is_enabled = helper.change_password.is_enabled("set_password_button", timeout=2)
    assert not is_enabled, "Update password button should be disabled"
