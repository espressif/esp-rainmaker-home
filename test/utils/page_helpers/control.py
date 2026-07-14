# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Device Control Screen Helper — light panel (power button, White/Colour tabs, param sliders via BasePage)."""
import logging
import time

from .base import BasePage

logger = logging.getLogger(__name__)

TAB_TEXT_FALLBACKS = {
    "white": ("White",),
    "colour": ("Colour", "Color"),
}


class Control(BasePage):
    def __init__(self, driver, page_helper_manager=None):
        super().__init__(driver, page_helper_manager)

    def check_screen_displayed(self, timeout=10, poll=0.25, quiet=False, handle_alerts=True):
        self.dismiss_join_wifi_dialog()
        return self.is_visible("screen", timeout=timeout, poll=poll)

    def dismiss_join_wifi_dialog(self):
        """Cancel the iOS SpringBoard 'Wants to Join Wi-Fi Network' alert that overlays the sliders."""
        if self.platform != "ios":
            return False
        try:
            buttons = self.driver.execute_script("mobile: alert", {"action": "getButtons"}) or []
            if any("join" in str(b).lower() for b in buttons):
                self.driver.execute_script("mobile: alert", {"action": "dismiss", "buttonLabel": "Cancel"})
                logger.info("Cancelled the iOS 'Join Wi-Fi Network' local-control dialog")
                time.sleep(1)
                return True
        except Exception:
            pass
        return False

    def open_tab(self, tab):
        """Switch the light panel to the White/Colour tab (writes the light-mode param)."""
        self.dismiss_join_wifi_dialog()
        key = tab.strip().lower()
        tab_id = f"button_light_{key}"
        logger.info("Opening '%s' tab on the light control screen", tab)
        if self.is_id_visible(tab_id, 3):
            self.click("id", tab_id)
        else:
            for text in TAB_TEXT_FALLBACKS.get(key, (tab,)):
                if self.is_visible("accessibility_id", text, timeout=2):
                    self.click("accessibility_id", text)
                    break
            else:
                raise RuntimeError(f"Tab '{tab}' not found on the light control screen")
        time.sleep(1.5)
        self._assert_tab_active(key)
        return self

    def _assert_tab_active(self, key, timeout=6):
        """Brightness is one shared param on this light, so the Hue slider's presence is what distinguishes the tabs."""
        want_hue = key == "colour"
        deadline = time.time() + timeout
        hue_visible = None
        while time.time() < deadline:
            hue_visible = self.is_id_visible("slider_Hue", 1)
            if hue_visible == want_hue:
                return
            time.sleep(0.5)
        raise RuntimeError(f"'{key}' tab did not become active (Hue slider visible={hue_visible})")

    def set_power(self, target_on, timeout=10):
        """Set the control-screen power button to target_on using its state-encoding ids."""
        self.dismiss_join_wifi_dialog()
        want = "on" if target_on else "off"
        deadline = time.time() + timeout
        while time.time() < deadline:
            current = self.read_power_state(timeout=2)
            if current == want:
                return self
            if current is None:
                time.sleep(0.5)
                continue
            self.click("power_button", timeout=5)
            time.sleep(1)
        raise RuntimeError(f"Could not set control-screen power to {want}")

    def set_slider(self, param, target, tol=3):
        """Drag a param slider to target and return the applied readback (retries around the iOS local-control dialog)."""
        target = int(target)
        max_v = self._param_slider_max(param)
        applied = None
        for attempt in range(3):
            self.dismiss_join_wifi_dialog()
            try:
                self.set_param_slider(param, target, max_v=max_v)
            except RuntimeError as error:
                logger.info("Slider '%s' interaction failed (%s, attempt %s); re-checking dialog", param, error, attempt + 1)
                self.dismiss_join_wifi_dialog()
                continue
            applied = self.read_slider_value(param)
            if applied is not None and abs(applied - target) <= tol:
                break
            logger.info("Slider '%s' applied %s, want %s (attempt %s); re-checking dialog", param, applied, target, attempt + 1)
        logger.info("Slider '%s' requested %s, applied %s", param, target, applied)
        return applied if applied is not None else target

    def go_back_home(self):
        self.get_other_page_helper('home').go_home()
        return self
