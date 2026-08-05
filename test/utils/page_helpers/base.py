# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

import re
import time
import logging
from pathlib import Path
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    NoSuchElementException,
    StaleElementReferenceException,
    TimeoutException,
)
from utils.locator_loader import LocatorLoader

logger = logging.getLogger(__name__)


def _is_stale_reference_error(error):
    """Return True for Selenium/Appium stale element exceptions."""
    if isinstance(error, StaleElementReferenceException):
        return True
    error_name = error.__class__.__name__
    error_message = str(error)
    return "Stale" in error_name or "StaleObject" in error_message


class BasePage:
    def __init__(self, driver, page_helper_manager=None, default_timeout=5):
        self.driver = driver
        self.default_timeout = default_timeout
        self.page_helper_manager = page_helper_manager
        
        # Determine platform from capabilities
        caps = driver.capabilities
        self.platform = caps.get('platformName', 'Android').lower()
        
        # Initialize locator loader
        self.locator_loader = LocatorLoader()
        
        # Auto-generate page name from class name
        import re
        class_name = self.__class__.__name__
        # Insert underscore before uppercase letters that follow lowercase letters
        snake_case = re.sub(r'(?<!^)(?=[A-Z])', '_', class_name).lower()
        self.page_name = snake_case

    @staticmethod
    def get_locator(locator_type):
        """Convert string locator type to Appium/Selenium locator constant"""
        locator_map = {
            "id": AppiumBy.ID,
            "xpath": AppiumBy.XPATH,
            "accessibility_id": AppiumBy.ACCESSIBILITY_ID,
            "class_name": AppiumBy.CLASS_NAME,
            "name": AppiumBy.NAME,
            "tag_name": AppiumBy.TAG_NAME,
            "link_text": AppiumBy.LINK_TEXT,
            "partial_link_text": AppiumBy.PARTIAL_LINK_TEXT,
            "css_selector": AppiumBy.CSS_SELECTOR,
            "android_uiautomator": AppiumBy.ANDROID_UIAUTOMATOR,
            "ios_predicate": AppiumBy.IOS_PREDICATE,
            "ios_class_chain": AppiumBy.IOS_CLASS_CHAIN,
            "css": By.CSS_SELECTOR,
            "tag": By.TAG_NAME
        }
        
        locator_key = str(locator_type).lower().strip()
        locator = locator_map.get(locator_key)
        
        if locator is None:
            raise ValueError(f"Unsupported locator type: '{locator_type}'. "
                           f"Supported types: {list(locator_map.keys())}")
        
        return locator
    
    def get_element_locator(self, locator_name: str):
        """Get locator from JSON file and parse it"""
        locator_data = self.locator_loader.get_locator(self.page_name, locator_name)
        
        if not locator_data:
            raise ValueError(f"Locator '{locator_name}' not found in {self.page_name} page")
        
        locator_type = locator_data.get("by")
        locator_value = locator_data.get("value")
        
        if not locator_type or not locator_value:
            raise ValueError(f"Invalid locator structure for '{locator_name}'. Expected 'by' and 'value' keys.")
        
        return self.get_locator(locator_type), locator_value

    def find_clickable(self, locator_name_or_type, value=None, timeout=None, poll=0.5):
        """Find clickable element"""
        timeout = timeout or self.default_timeout
        
        if value is None:
            # Using JSON locator name
            by, locator_value = self.get_element_locator(locator_name_or_type)
        else:
            # Traditional usage with locator type
            by = self.get_locator(locator_name_or_type)
            locator_value = value
        
        try:
            return WebDriverWait(
                self.driver, timeout, poll_frequency=poll,
                ignored_exceptions=(StaleElementReferenceException,),
            ).until(
                EC.element_to_be_clickable((by, locator_value))
            )
        except TimeoutException:
            raise NoSuchElementException(f"Clickable element not found: {by}='{locator_value}' within {timeout}s")

    def click(self, locator_name_or_type, value=None, timeout=None, poll=0.5):
        """Click element with wait"""
        last_err = None
        for attempt in range(3):
            try:
                element = self.find_clickable(locator_name_or_type, value, timeout, poll=poll)
                element.click()
                return element
            except Exception as e:
                if _is_stale_reference_error(e) and attempt < 2:
                    last_err = e
                    time.sleep(0.5)
                    continue
                raise
        raise last_err

    def send_keys(self, locator_name_or_type, value_or_text, text=None, clear_first=False, timeout=None, poll=0.5):
        """Send keys to element"""
        last_err = None
        for attempt in range(3):
            try:
                if text is None:
                    # Using JSON locator name
                    element = self.find_clickable(locator_name_or_type, None, timeout, poll=poll)
                    the_text = value_or_text
                else:
                    # Traditional usage
                    element = self.find_clickable(locator_name_or_type, value_or_text, timeout, poll=poll)
                    the_text = text
                if clear_first:
                    element.clear()
                element.send_keys(the_text)
                return element
            except Exception as e:
                if _is_stale_reference_error(e) and attempt < 2:
                    last_err = e
                    time.sleep(0.5)
                    continue
                raise
        raise last_err


    def clear(self, locator_name_or_type, value=None, timeout=None, poll=0.5):
        """Clear element text"""
        element = self.find_visible(locator_name_or_type, value=value, timeout=timeout or self.default_timeout, poll=poll)
        if not element:
            raise NoSuchElementException(f"Visible element not found for clear: {locator_name_or_type}")
        element.clear()
        return element

    def is_enabled(self, locator_name_or_type, value=None, timeout=None, poll=0.5):
        """Check if element is enabled"""
        try:
            element = self.find_visible(locator_name_or_type, value=value, timeout=timeout or self.default_timeout, poll=poll)
            return element.is_enabled() if element else False
        except Exception:
            return False

    def find_visible(self, locator_name_or_type, value=None, timeout=2, poll=0.5):
        """Return visible element or None (quick check)"""
        try:
            if value is None:
                by, locator_value = self.get_element_locator(locator_name_or_type)
            else:
                by = self.get_locator(locator_name_or_type)
                locator_value = value

            return WebDriverWait(self.driver, timeout, poll_frequency=poll).until(
                EC.visibility_of_element_located((by, locator_value))
            )
        except TimeoutException:
            return None

    def is_visible(self, locator_name_or_type, value=None, timeout=2, poll=0.5):
        """Check if element is visible (quick check)"""
        return self.find_visible(locator_name_or_type, value=value, timeout=timeout, poll=poll) is not None

    def find_all(self, locator_name_or_type, value=None):
        """Return all elements matching a JSON locator (may be empty)."""
        if value is None:
            by, locator_value = self.get_element_locator(locator_name_or_type)
        else:
            by = self.get_locator(locator_name_or_type)
            locator_value = value
        return self.driver.find_elements(by, locator_value)

    def get_text(self, locator_name_or_type=None, value=None, timeout=None, poll=0.25, element=None):
        """Get element text"""
        if element is not None:
            return element.text
        element = self.find_visible(locator_name_or_type, value=value, timeout=timeout or self.default_timeout, poll=poll)
        if not element:
            raise NoSuchElementException(f"Visible element not found for get_text: {locator_name_or_type}")
        return element.text

    def get_error_message(self):
        """Get error message displayed on screen"""
        element = self.find_visible("error_message", timeout=2)
        if element:
            return element.text
        return None

    def _resolve_locator(self, locator_name_or_type, value=None):
        """Resolve a JSON locator name or raw type/value pair."""
        if value is None:
            return self.get_element_locator(locator_name_or_type)
        return self.get_locator(locator_name_or_type), value

    def wait_for_element_to_disappear(self, locator_name_or_type, value=None, timeout=None, poll=0.25):
        """Wait for element to disappear; stale refs mean the UI node was replaced."""
        timeout = timeout or self.default_timeout
        by, locator_value = self._resolve_locator(locator_name_or_type, value)

        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            remaining = max(0.1, deadline - time.monotonic())
            try:
                WebDriverWait(self.driver, remaining, poll_frequency=poll).until_not(
                    EC.presence_of_element_located((by, locator_value))
                )
                return True
            except StaleElementReferenceException:
                return True
            except TimeoutException:
                continue
            except Exception as exc:
                if _is_stale_reference_error(exc):
                    return True
                raise

        return False

    # Helper methods to access other pages through page_helper_manager
    def get_other_page_helper(self, page_name: str):
        """
        Get another page helper instance
        Usage: self.get_other_page_helper('consent') -> returns Consent page instance
        """
        if not self.page_helper_manager:
            raise ValueError("No page_helper_manager available. Cannot access other page helpers.")
        
        return getattr(self.page_helper_manager, page_name)
    
    def get_locator_text(self, locator_name: str) -> str:
        """Get expected text for a locator from JSON file"""
        locator_data = self.locator_loader.get_locator(self.page_name, locator_name)
        
        if not locator_data:
            raise ValueError(f"Locator '{locator_name}' not found in {self.page_name} page")
        
        return locator_data.get("text", f"Text for {locator_name}")
    
    def check_screen_displayed(self, timeout=10, poll=0.25, quiet=False, handle_alerts=True):
        """
        Generic screen detection method that checks for title element with expected text

        This method can be overridden by specific page helpers for custom logic.
        By default, it looks for a 'title' element and compares its text
        with the expected text from the JSON locator file.

        When the screen is not detected and a system permission alert is
        blocking it (location/Bluetooth/local network/...), the alert is
        accepted once and the check retried — keeps every flow alive on
        first-run devices for both Android and iOS.

        Args:
            timeout: Seconds to wait for the expected title.
            poll: Poll interval for WebDriverWait.
            quiet: When True, timeouts are logged at DEBUG (for screen probing).
            handle_alerts: Clear a blocking system alert and retry once.
        """
        try:
            expected_text = self.get_locator_text("title")
            by, locator_value = self.get_element_locator("title")
            last_seen_text = None

            def _title_matches(driver):
                nonlocal last_seen_text

                try:
                    elements = driver.find_elements(by, locator_value)

                    for element in elements:
                        try:
                            text = element.text
                            if text:
                                last_seen_text = text
                            if text == expected_text:
                                return True
                        except StaleElementReferenceException:
                            continue
                    return False

                except StaleElementReferenceException:
                    return False
                except Exception:
                    return False

            WebDriverWait(self.driver, timeout, poll_frequency=poll).until(_title_matches)
            logger.info(f"Screen detected: {self.page_name} - '{expected_text}'")
            return True
        except TimeoutException:
            log = logger.debug if quiet else logger.warning
            if last_seen_text is None:
                log(
                    "Screen detection timeout after %ss - Expected: '%s' (%s)",
                    timeout,
                    expected_text,
                    self.page_name,
                )
            else:
                log(
                    (
                        "Screen detection timeout after %ss - Expected: '%s' (%s), "
                        "Last seen: '%s'"
                    ),
                    timeout,
                    expected_text,
                    self.page_name,
                    last_seen_text,
                )
            # Only clear alerts on real screen assertions, not on fast `quiet`
            # race-detection probes (e.g. the continue-tap screen scan) — those
            # would otherwise each pay a ~1s Android alert poll on every miss.
            if handle_alerts and not quiet and self._clear_blocking_system_alert():
                logger.info("System alert cleared; rechecking %s screen", self.page_name)
                return self.check_screen_displayed(
                    timeout=min(timeout, 5), poll=poll, quiet=quiet, handle_alerts=False
                )
            return False
        except Exception as e:
            log = logger.debug if quiet else logger.warning
            log("Screen detection failed (%s): %s", self.page_name, e)
            return False

    def _clear_blocking_system_alert(self) -> bool:
        """Accept any system permission alert covering the expected screen."""
        if not self.page_helper_manager:
            return False
        try:
            permissions = self.get_other_page_helper("permissions")
            return bool(permissions.handle_all_permissions(action="allow", timeout=4))
        except Exception as error:
            logger.debug("Alert clearing skipped: %s", error)
            return False
    
    def _is_keyboard_shown(self) -> bool:
        """Return True when the soft keyboard is reported as visible."""
        if self.platform == "android":
            try:
                return bool(self.driver.is_keyboard_shown())
            except Exception:
                return False
        elif self.platform == "ios":
            try:
                return self.driver.find_element("xpath", "//XCUIElementTypeKeyboard").is_displayed()
            except Exception:
                return False
        else:
            return False
            
    def is_id_visible(self, value, timeout=3):
        """Quick visibility check for a raw resource-id / accessibility-id (shorthand for is_visible('id', ...))."""
        return self.is_visible("id", value, timeout=timeout)

    def open_param_editor(self, row_id, save_key, tries=3):
        """Open a device-param's value editor by tapping its selection row, re-tapping if a tap lands mid push-transition"""
        for _ in range(tries):
            self.click("id", row_id, timeout=10)
            if self.is_visible(save_key, timeout=3):
                return self
        raise RuntimeError(f"Param editor '{row_id}' did not open after {tries} taps")

    def set_param_toggle(self, label, target_on, timeout=10):
        """Set a boolean param control (Power, etc.) to target_on using its state-encoding id."""
        on_id = f"toggle_{label}_on"
        off_id = f"toggle_{label}_off"
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.is_id_visible(on_id, 1):
                current, present = True, on_id
            elif self.is_id_visible(off_id, 1):
                current, present = False, off_id
            else:
                time.sleep(0.5)
                continue
            if current == bool(target_on):
                return self
            self.click("id", present, timeout=5)
            time.sleep(0.8)
        raise RuntimeError(f"Could not set toggle '{label}' to {target_on}")

    def set_modal_param_value(self, label, value):
        """Set a param control and return the value applied: boolean via toggle, else numeric via slider."""
        token = str(value).strip().lower()
        if token in ("on", "off", "true", "false", "1", "0"):
            on = token in ("on", "true", "1")
            self.set_param_toggle(label, on)
            return on
        self.set_param_slider(label, int(value), max_v=self._param_slider_max(label))
        return self.read_slider_value(label)

    def _param_slider_range(self, label):
        """Value range (min, max) of a slider param — Hue 0-360, CCT 2700-6500K, most others 0-100."""
        if label == "Hue":
            return (0, 360)
        if label == "CCT":
            return (2700, 6500)
        return (0, 100)

    def _param_slider_max(self, label):
        """Upper bound of a slider param control."""
        return self._param_slider_range(label)[1]

    def read_slider_value(self, label, timeout=5):
        """Read a slider param's numeric value from the `slider_<label>_value` text (ID only)."""
        deadline = time.time() + timeout
        while True:
            for el in self.find_all("id", value=f"slider_{label}_value"):
                try:
                    txt = el.text or ""
                except Exception:
                    continue
                match = re.search(r"-?\d+", txt)
                if match:
                    return int(match.group())
            if time.time() >= deadline:
                return None
            time.sleep(0.5)

    def set_param_slider(self, label, target, min_v=0, max_v=100, tol=2, tries=5):
        """Drag a slider param control to target value; verify via readback, retry if off."""
        for _ in range(tries):
            try:
                current = self.read_slider_value(label)
            except Exception:
                current = None
            if current is not None and abs(current - target) <= tol:
                return self
            container = self.find_visible("id", value=f"slider_{label}", timeout=5)
            if not container:
                raise RuntimeError(f"Slider '{label}' not found")
            rect = container.rect
            span = max(1, (max_v - min_v))
            tfrac = min(1.0, max(0.0, (target - min_v) / span))
            cfrac = 0.0 if current is None else min(1.0, max(0.0, (current - min_v) / span))
            pad = rect["width"] * 0.04
            lo, hi = rect["x"] + pad, rect["x"] + rect["width"] - pad
            ty = int(rect["y"] + rect["height"] / 2)
            sx = int(min(max(rect["x"] + cfrac * rect["width"], lo), hi))
            tx = int(min(max(rect["x"] + tfrac * rect["width"], lo), hi))
            self._drag(sx, ty, tx, ty)
            time.sleep(0.6)
        return self

    def _drag(self, x1, y1, x2, y2):
        """W3C touch drag from (x1,y1) to (x2,y2); cross-platform."""
        from selenium.webdriver.common.actions.action_builder import ActionBuilder
        from selenium.webdriver.common.actions.pointer_input import PointerInput
        from selenium.webdriver.common.actions import interaction

        pointer = PointerInput(interaction.POINTER_TOUCH, "touch")
        ab = ActionBuilder(self.driver, mouse=pointer)
        ab.pointer_action.move_to_location(x1, y1)
        ab.pointer_action.pointer_down()
        ab.pointer_action.pause(0.15)
        ab.pointer_action.move_to_location(x2, y2)
        ab.pointer_action.pause(0.15)
        ab.pointer_action.pointer_up()
        ab.perform()

    def get_success_toast(self, timeout=10):
        """Return the success toast title (shared by scene/schedule/automation flows)."""
        title, _ = self.get_toast_title_and_message(timeout=timeout, require_message=False)
        return title

    def delete_all_via_card_menu(self, card_locator, delete_option_id, refresh_button=None,
                                 dismiss_id=None, max_rounds=10):
        """Delete every list card via its menu (tap card -> menu -> delete), re-tapping if a tap missed the menu."""
        for round_index in range(max_rounds):
            if refresh_button:
                self.refresh_list(refresh_button)
            cards = self.find_all(card_locator)
            if not cards:
                if round_index == 0:
                    time.sleep(3)
                    cards = self.find_all(card_locator)
                if not cards:
                    break
            try:
                cards[0].click()
            except Exception:
                continue
            if self.is_id_visible(delete_option_id, 5):
                try:
                    self.click("id", delete_option_id, timeout=4)
                    time.sleep(1.5)
                    continue
                except Exception:
                    pass
            if dismiss_id:
                try:
                    self.click(dismiss_id, timeout=2)
                except Exception:
                    pass
            time.sleep(0.5)
        return self

    def is_named_item_visible(self, name_id, refresh_button=None, timeout=8, attempts=1):
        """True if a per-name list card is visible; attempts>1 (refresh between tries) is for presence checks only."""
        for attempt in range(attempts):
            if self.is_id_visible(name_id, timeout):
                return True
            if refresh_button and attempt < attempts - 1:
                self.refresh_list(refresh_button)
        return False

    def refresh_list(self, refresh_button, settle=2):
        """Pull fresh cloud state into a list via its refresh control (best-effort)."""
        try:
            self.click(refresh_button, timeout=3)
            time.sleep(settle)
        except Exception:
            pass
        return self

    def _is_editing(self, edit_text_locator):
        """True when an Edit/Done list toggle currently reads 'Done'."""
        try:
            return (self.get_text("id", edit_text_locator, timeout=2) or "").strip().lower() == "done"
        except Exception:
            return False

    def set_editing(self, edit_text_locator, edit_button, editing):
        """Enter or leave list edit mode from the toggle's current state, not a blind tap."""
        if self._is_editing(edit_text_locator) != editing and self.is_visible(edit_button, timeout=3):
            self.click(edit_button, timeout=10)
            time.sleep(0.6)
        return self

    def delete_all_in_edit_mode(self, edit_button, delete_item, edit_text_locator,
                                refresh_button=None, max_rounds=4, max_items=30):
        """Delete every list row via edit-mode trash buttons, retrying until the list is clean."""
        for _ in range(max_rounds):
            if refresh_button:
                self.refresh_list(refresh_button)
            if not self.is_visible(edit_button, timeout=4):
                return self
            self.set_editing(edit_text_locator, edit_button, True)
            self.is_visible(delete_item, timeout=6)
            logger.info("delete_all '%s': editing=%s, items=%d", delete_item,
                        self._is_editing(edit_text_locator), len(self.find_all(delete_item) or []))
            for _ in range(max_items):
                try:
                    items = self.find_all(delete_item)
                except Exception:
                    time.sleep(0.5)
                    continue
                if not items:
                    break
                try:
                    items[0].click()
                except Exception:
                    pass
                time.sleep(1.2)
            self.set_editing(edit_text_locator, edit_button, False)
        return self

    def _element_label(self, element):
        """Best-effort visible text/label of an element, including descendant text (list rows expose the name on a child)."""
        for attr in (None, "name", "label", "content-desc"):
            try:
                value = element.text if attr is None else element.get_attribute(attr)
                if value:
                    return value
            except Exception:
                continue
        try:
            parts = []
            for kid in element.find_elements("xpath", ".//*"):
                text = ""
                try:
                    text = kid.text or kid.get_attribute("content-desc") or kid.get_attribute("name") or ""
                except Exception:
                    text = ""
                if text:
                    parts.append(text)
            return " ".join(parts)
        except Exception:
            return ""

    def select_named_device(self, name, timeout=15):
        """Select a device on any device-selection screen by its name-specific id; clicks the visible label (the row's tap target may not register as 'clickable', and the list can load asynchronously)."""
        element = self.find_visible("id", value=f"text_{name}_device_name", timeout=timeout)
        if not element:
            raise RuntimeError(f"Device '{name}' not found on the device-selection screen")
        element.click()
        return self

    def select_list_item(self, items_locator, name=None, timeout=10):
        """Click a list row matching `name`; click the sole row if there is only one."""
        self.is_visible(items_locator, timeout=timeout)
        rows = self.find_all(items_locator)
        if not rows:
            raise RuntimeError(f"No '{items_locator}' rows available to select")
        if name:
            for row in rows:
                if name.lower() in self._element_label(row).lower():
                    row.click()
                    return self
            raise RuntimeError(f"No '{items_locator}' row matched '{name}' among {len(rows)} rows")
        rows[0].click()
        return self

    def read_power_state(self, timeout=5):
        """Return 'on'/'off' from the device-control power button, or None if not found."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.is_id_visible("power_state_on", 1):
                return "on"
            if self.is_id_visible("power_state_off", 1):
                return "off"
            time.sleep(0.5)
        return None

    def hide_keyboard_if_visible(self):
        """Hide keyboard if visible; return True only when keyboard is gone (or was never shown)."""
        try:
            if not self._is_keyboard_shown():
                return True

            if self.platform == "ios":
                try:
                    size = self.driver.get_window_size()
                    x, y = size["width"] // 2, int(size["height"] * 0.25)
                    self.driver.tap([(x, y)])
                    if not self._is_keyboard_shown():
                        logger.info("iOS keyboard hidden via tap in content area")
                        return True
                except Exception:
                    pass

                for key in ["Done", "Return"]:
                    try:
                        self.driver.hide_keyboard(strategy="pressKey", key=key)
                    except Exception:
                        continue
                    if not self._is_keyboard_shown():
                        logger.info("iOS keyboard hidden via pressKey key=%s", key)
                        return True

            elif self.platform == "android":
                try:
                    self.driver.hide_keyboard()
                    if not self._is_keyboard_shown():
                        logger.info("Android keyboard hidden via hide_keyboard")
                        return True
                except Exception:
                    pass
                try:
                    self.driver.press_keycode(4)
                    if not self._is_keyboard_shown():
                        logger.info("Android keyboard hidden via back button")
                        return True
                except Exception:
                    pass

            if not self._is_keyboard_shown():
                return True

            logger.warning("Keyboard still visible after hide attempts")
            return False
        except Exception as e:
            logger.warning(f"Failed to hide keyboard: {e}")
            return False
    
    def get_toast_title_and_message(self, timeout=2, poll=0.25, require_message=True):
        """Read toast title and message using standard testIDs (toast_title, toast_message)."""
        title = None
        message = None
        by = AppiumBy.ID
        title_locator = "toast_title"
        message_locator = "toast_message"

        def _read_toast(driver):
            nonlocal title, message
            try:
                title_element = driver.find_element(by, title_locator)
                title = title_element.text
                message = None
                try:
                    message_element = driver.find_element(by, message_locator)
                    message = message_element.text
                except Exception:
                    message = None
                return message is not None if require_message else True
            except Exception:
                return False

        try:
            WebDriverWait(self.driver, timeout, poll_frequency=poll).until(_read_toast)
        except TimeoutException:
            logger.warning("Toast element not found")
            return None, None
        return title, message


class PageHelperManager:
    """
    Manages page helper instances and their dependencies

    - Example: page.provisioning -> looks for utils.page_helpers.provisioning.Provisioning class
    """
    
    def __init__(self, driver):
        self.driver = driver
        self._page_helpers = {}
        
    def get_page_helper(self, page_class):
        """Get or create page helper instance"""
        page_name = page_class.__name__
        
        if page_name not in self._page_helpers:
            self._page_helpers[page_name] = page_class(self.driver, page_helper_manager=self)
        
        return self._page_helpers[page_name]
    
    def __getattr__(self, name):
        """
        Dynamic page helper access - converts page name to class and returns instance

        How it works:
        1. page.provisioning -> name = 'provisioning'
        2. Converts to class name: 'Provisioning'
        3. Imports utils.page_helpers.provisioning.Provisioning
        4. Returns cached instance or creates new one
        """
        # Convert snake_case to PascalCase for class names
        class_name = ''.join(word.capitalize() for word in name.split('_'))

        import importlib.util
        module_path = f'utils.page_helpers.{name}'
        try:
            spec = importlib.util.find_spec(module_path)
        except (ImportError, ValueError):
            spec = None
        if spec is None:
            raise AttributeError(f"Page helper '{name}' not found. Make sure utils/page_helpers/{name}.py exists with class {class_name}")
        # Module exists: let a genuine import error inside it propagate (don't mask it as 'not found').
        module = importlib.import_module(module_path)
        try:
            page_class = getattr(module, class_name)
        except AttributeError:
            raise AttributeError(f"Page helper module '{name}' found but class '{class_name}' is missing")
        return self.get_page_helper(page_class)
