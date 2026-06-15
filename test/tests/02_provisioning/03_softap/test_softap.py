# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
BDD tests for SoftAP provisioning flow.

Shared provisioning steps live in tests/02_provisioning/conftest.py.
"""
import logging

import pytest
from pytest_bdd import scenarios, then, when

logger = logging.getLogger(__name__)
pytestmark = [pytest.mark.regression, pytest.mark.provisioning]

scenarios("softap.feature")


@then("user should be on connect to device screen")
def should_be_on_softap_screen(helper):
    assert helper.scan_softap.check_screen_displayed(timeout=10), "Should be on connect to device screen"


@when("user connects to the discovered softap device")
def connect_to_softap_device(helper, capture_device_prov_info):
    """Join the device hotspot named in the serial payload (PROV_xxxxxx).
    """
    info = capture_device_prov_info(timeout=30, required=False)
    settled = helper.scan_softap.connect_to_device(info.get("name"))
    assert settled, f"SoftAP connect to '{info.get('name')}' did not reach the next screen"

@then("connect to device screen elements should be present")
def softap_elements_present(helper):
    helper.scan_softap.grant_runtime_permissions_if_needed()
    helper.scan_softap.validate_screen_elements()
