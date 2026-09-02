# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Group sharing per-scenario reset: fresh secondary user, revoke existing shares, restore home name and membership."""

import logging
import time

import pytest

from utils.registered_user_resolver import mutate_registered_users

logger = logging.getLogger(__name__)


@pytest.fixture
def invite_identifier(registered_user_resolver):
    """The value the primary types to share: the invitee's username (their email)."""
    def resolve(login_user):
        return registered_user_resolver(login_user)
    return resolve


@pytest.fixture(autouse=True)
def reset_group_sharing_state(pytestconfig, primary_cloud):
    if primary_cloud is not None and hasattr(primary_cloud, "revoke_group_sharing"):
        try:
            deployment = pytestconfig.getoption("--deployment")
            model = pytestconfig.getoption("--model", default=None)
            mutate_registered_users(deployment, model, lambda existing: existing[:1])
            primary_cloud.reset_home_name("Home")
            if hasattr(primary_cloud, "issued_sharing_requests"):
                for request in list(primary_cloud.issued_sharing_requests()):
                    request_id = request.get("request_id")
                    if not request_id:
                        continue
                    try:
                        primary_cloud.remove_sharing_request(request_id)
                        logger.info("Removed stale sharing request %s (%s)", request_id, request.get("request_status"))
                    except Exception as error:
                        logger.warning("Stale sharing request %s not removed: %s", request_id, error)
            for username in list(primary_cloud.shared_usernames()):
                primary_cloud.revoke_group_sharing(username)
            deadline = time.time() + 10
            while time.time() < deadline and primary_cloud.shared_usernames():
                time.sleep(1)
            primary_cloud.ensure_online_node_in_home()
        except Exception as error:
            logger.warning("Group-sharing API reset skipped: %s", error)
    yield
