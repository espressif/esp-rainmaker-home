# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""BDD Third-Party Login Tests - Google and Apple OAuth flows."""
import subprocess
import pytest
import logging
from pytest_bdd import scenarios, when, then, parsers

from utils.phone_network import adb_prefix

logger = logging.getLogger(__name__)
pytestmark = [pytest.mark.regression, pytest.mark.user_management, pytest.mark.third_party]

scenarios('third_party_login.feature')


@pytest.fixture(autouse=True)
def fresh_browser_state(helper):
    """Reset Chrome so provider session cookies from a prior scenario can't skip the auth form."""
    if helper.login.platform == "android":
        subprocess.run(adb_prefix(helper.driver) + ["shell", "pm", "clear", "com.android.chrome"],
                       capture_output=True, text=True, timeout=20)
    yield


@pytest.fixture(autouse=True)
def restore_login_state(helper, login_session_state):
    """Force the app back to the login screen and invalidate the session-reuse cache after a 3P scenario."""
    yield
    login_session_state.pop("email", None)
    try:
        helper.oauth_login._ios_dismiss_local_network_dialog()
        if helper.home.check_screen_displayed(timeout=2, quiet=True):
            helper.login.logout_to_login_screen()
    except Exception as error:
        logger.warning("Post-scenario logout failed: %s", error)

@when(parsers.parse('user taps the "{provider}" login button'))
def tap_provider_button(helper, provider):
    helper.oauth_login.tap_provider(provider)

@then(parsers.parse('the "{provider}" auth page should open'))
def auth_page_should_open(helper, provider):
    assert helper.oauth_login.wait_for_auth_page(provider), f"{provider} auth page did not open"

@when("user cancels the third-party login")
def cancel_third_party_login(helper):
    helper.oauth_login.cancel_auth()

@when(parsers.parse('user completes "{provider}" authentication'))
def complete_authentication(helper, provider, oauth_user_resolver):
    account = oauth_user_resolver(provider, helper.driver._test_info.get("platform"))
    helper.oauth_login.perform_auth(provider, account["email"], account["password"],
                                    totp_secret=account.get("totp_secret"))
    assert helper.oauth_login.wait_for_login_completion(), "Home screen not displayed after oauth login"

@when("user logs out of the app")
def logout_of_app(helper):
    helper.oauth_login._ios_dismiss_local_network_dialog()
    helper.login.logout_to_login_screen()
