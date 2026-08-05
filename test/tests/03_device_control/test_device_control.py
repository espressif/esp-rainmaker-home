# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""BDD Device Control Tests - dynamic light params from home card and control screen."""
import time
import pytest
import logging
from pytest_bdd import scenarios, when, then, parsers

from utils.phone_network import PhoneNetwork

logger = logging.getLogger(__name__)
pytestmark = [pytest.mark.regression, pytest.mark.device_control]

scenarios('device_control.feature')


@pytest.fixture(autouse=True)
def restore_baseline_params(hardware_session):
    yield
    ds = hardware_session.get("device_serial")
    baseline = hardware_session.get("baseline_params") or {}
    if ds is None or not baseline:
        return
    for param, value in baseline.items():
        if isinstance(value, (bool, int)) and " " not in param:
            try:
                ds.set_param(param, value)
            except Exception as error:
                logger.warning("Baseline restore of %s=%s failed: %s", param, value, error)


def _mark_serial(hardware_session):
    """Stamp the serial-log position once per scenario, before the first param change."""
    hardware_session.setdefault("serial_since", hardware_session["device_serial"].marker())


@then(parsers.parse('the home card should show "{device}" as locally reachable'))
def home_card_locally_reachable(helper, device):
    helper.home.go_home()
    assert helper.home.is_local_control_badge_visible(timeout=20), \
        f"'Available on WLAN' badge not shown for {device}; local control not active"


@when(parsers.parse('user opens the "{device}" control screen'))
def open_control_screen(helper, device):
    helper.home.go_home()
    helper.home.open_device(device)
    assert helper.control.check_screen_displayed(timeout=10), "Control screen not displayed"


@when(parsers.parse('user turns the device power "{state}" from the control screen'))
def control_screen_power(helper, hardware_session, state):
    _mark_serial(hardware_session)
    helper.control.set_power(state == "on")


@when(parsers.parse('user opens the "{tab}" tab'))
def open_light_tab(helper, tab):
    helper.control.open_tab(tab)


@when(parsers.parse('user sets "{param}" to "{value}" from the control screen'))
def set_control_slider(helper, hardware_session, param, value):
    _mark_serial(hardware_session)
    hardware_session.setdefault("set_values", {})[param] = helper.control.set_slider(param, value)


@when("the phone switches to mobile data only")
def phone_mobile_data_only(request, helper):
    settings = helper.phone_settings
    if helper.control.platform == "android":
        net = PhoneNetwork(helper.driver)
        def _teardown_network():
            settings.set_wifi(True)
            net.set_mobile_data(False)
        request.addfinalizer(_teardown_network)
        net.set_mobile_data(True)
        if not settings.set_wifi(False):
            pytest.skip("Wi-Fi radio did not turn off via Settings (UI-only toggle on this device); cannot force cloud path")
        if not net.has_internet(timeout=30):
            settings.set_wifi(True)
            pytest.skip("Phone has no mobile-data internet; cannot force cloud path")
    else:
        request.addfinalizer(lambda: settings.set_wifi(True))
        if not settings.set_wifi(False):
            pytest.skip("Wi-Fi radio did not turn off via iOS Settings; cannot force cloud path")
    logger.info("Phone is on mobile data only; local transport unavailable")


@then("the phone restores Wi-Fi")
def phone_restores_wifi(helper):
    assert helper.phone_settings.set_wifi(True), "Wi-Fi radio did not re-enable via Settings"
    if helper.control.platform == "android":
        assert PhoneNetwork(helper.driver).has_internet(timeout=45), "Phone did not regain connectivity after re-enabling Wi-Fi"
