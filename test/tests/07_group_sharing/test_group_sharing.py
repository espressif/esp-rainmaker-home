# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Group sharing flow: name and share a home, accept as the secondary user, verify control, revoke."""

import logging

import pytest
from pytest_bdd import scenarios, then, when, parsers

logger = logging.getLogger(__name__)

pytestmark = [pytest.mark.regression, pytest.mark.group_sharing]

scenarios("group_sharing.feature")


@when(parsers.parse('user opens the home sharing settings for "{home_name}"'))
def open_home_sharing_settings(helper, home_name):
    helper.group_sharing.open_home_settings(home_name)


@when(parsers.parse('user renames the home to "{new_name}"'))
@then(parsers.parse('user renames the home to "{new_name}"'))
def rename_home(helper, new_name):
    helper.home_management.rename_home(new_name)


@when(parsers.parse('user switches to "{login_user}"'))
def switch_account(helper, registered_user_resolver, registered_user_password_resolver, login_session_state, login_user):
    email = registered_user_resolver(login_user)
    password = registered_user_password_resolver(f"{login_user} password")
    helper.group_sharing.relogin(email, password)
    login_session_state["email"] = email


@when(parsers.parse('user shares the home with "{login_user}"'))
def share_home_with_user(helper, invite_identifier, login_user):
    helper.group_sharing.share_home_with(invite_identifier(login_user))


@when("user opens the notification center")
def open_notification_center(helper):
    helper.group_sharing.open_notification_center()


@when(parsers.parse('user opens the shared home settings for "{home_name}"'))
def open_shared_home_settings(helper, home_name):
    helper.group_sharing.open_shared_home_settings(home_name)


@then(parsers.parse('the home should show it is shared by "{login_user}"'))
def home_shared_by(helper, registered_user_resolver, login_user):
    helper.group_sharing.assert_shared_by(registered_user_resolver(login_user))


@then("the add user option should not be available")
def add_user_absent(helper):
    helper.group_sharing.assert_add_user_absent()


@then("the leave home option should be available")
def leave_home_available(helper):
    helper.home_management.assert_leave_home_available()


@when(parsers.parse('user accepts the sharing invitation from "{login_user}"'))
def accept_sharing_invitation(helper, registered_user_resolver, login_user):
    helper.group_sharing.act_on_invitation("accept", registered_user_resolver(login_user))


@then(parsers.parse('a "{message}" toast should be shown'))
def toast_shown(helper, message):
    helper.group_sharing.assert_toast(message)


@when(parsers.parse('user selects the home "{home_name}"'))
def select_home(helper, home_name):
    helper.home_management.select_home(home_name)


@when(parsers.parse('user revokes home sharing for "{login_user}"'))
def revoke_home_sharing(helper, registered_user_resolver, login_user):
    helper.group_sharing.revoke_sharing_for(registered_user_resolver(login_user))


@then(parsers.parse('"{login_user}" should be listed under "{section}"'))
def user_listed_under(helper, registered_user_resolver, login_user, section):
    key = "pending" if section.startswith("pending") else "shared"
    assert helper.group_sharing.is_user_listed(key, registered_user_resolver(login_user)), (
        f"{login_user} not listed under {section}"
    )


@then(parsers.parse('"{login_user}" should not be listed under "{section}"'))
def user_not_listed_under(helper, registered_user_resolver, login_user, section):
    key = "pending" if section.startswith("pending") else "shared"
    assert not helper.group_sharing.is_user_listed(key, registered_user_resolver(login_user), timeout=3), (
        f"{login_user} still listed under {section}"
    )
