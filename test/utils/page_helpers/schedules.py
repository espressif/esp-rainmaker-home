# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Schedules page helper: create a one-time schedule, set its time, and clean up."""

import datetime
import logging
import re
import time

from .base import BasePage

logger = logging.getLogger(__name__)


class Schedules(BasePage):
    def open_schedule_tab(self):
        """Open the Schedules screen from the footer tab."""
        self.click("schedule_tab", timeout=10)
        return self

    def refresh_schedules(self):
        """Refresh the schedules list so cloud-side changes are reflected."""
        return self.refresh_list("refresh_schedules_button")

    def delete_all_schedules(self):
        """Remove every schedule so the create flow starts clean (fired one-time schedules stay disabled)."""
        return self.delete_all_in_edit_mode(
            "edit_schedules_button", "schedule_delete_item", "text_edit_schedules",
            refresh_button="refresh_schedules_button",
        )

    def tap_add_schedule(self):
        """Tap the Add Schedule button."""
        self.click("add_schedule_button", timeout=10)
        return self

    def enter_schedule_name(self, name):
        """Type the schedule name and confirm."""
        self.send_keys("name_input", name, clear_first=True, timeout=10)
        if self.platform != "ios":
            self.hide_keyboard_if_visible()
        self.click("name_confirm_button", timeout=10)
        return self

    def set_time_ahead(self, minutes_ahead=3):
        """Open the time picker at now + minutes_ahead, verify the wheels landed, and fail fast if the hour/period is wrong."""
        minutes_ahead = max(minutes_ahead, 4)
        target = datetime.datetime.now() + datetime.timedelta(minutes=minutes_ahead)
        hour12 = target.hour % 12 or 12
        minute = target.minute
        period = "AM" if target.hour < 12 else "PM"
        logger.info("Scheduling for %02d:%02d %s", hour12, minute, period)
        self.click("schedule_time_button", timeout=10)
        for attempt in range(2):
            self._pick_wheel("hour", hour12)
            self._pick_wheel("minute", minute)
            self._pick_wheel("period", period)
            got_h = self._read_wheel_selected("hour")
            got_m = self._read_wheel_selected("minute")
            got_p = self.is_id_visible(f"time_period_{period}_selected", 2)
            if got_h == hour12 and got_p and got_m is not None and abs(got_m - minute) <= 1:
                break
            logger.warning("TimePicker attempt %d off: wanted %02d:%02d %s, got %s:%s period_ok=%s",
                           attempt + 1, hour12, minute, period, got_h, got_m, got_p)
        logger.info("TimePicker final read: hour=%s minute=%s period_ok=%s", got_h, got_m, got_p)
        assert got_h == hour12 and got_p, (
            f"TimePicker could not be set: wanted {hour12:02d} {period}, got hour={got_h} period_ok={got_p}"
        )
        self.click("time_picker_done_button", timeout=10)
        return self

    def _pick_wheel(self, col, value, max_taps=40):
        """Set a TimePicker wheel: momentum-fling toward the target for big gaps, then tap the last few cells for an exact landing."""
        target_id = f"time_{col}_{value}"
        if col == "period":
            if self.is_id_visible(f"{target_id}_selected", 1):
                return
            if self.is_id_visible(target_id, 2):
                self.click("id", target_id, timeout=3)
                time.sleep(0.4)
            else:
                logger.warning("TimePicker period item %s not visible", target_id)
            return
        target = int(value)
        lo, hi = (0, 59) if col == "minute" else (1, 12)
        fine_only = False
        for _ in range(max_taps):
            current = self._read_wheel_selected(col)
            if current == target:
                if self.is_id_visible(target_id, 1):
                    self.click("id", target_id, timeout=2)
                    time.sleep(0.3)
                return
            if current is None:
                if self.is_id_visible(target_id, 1):
                    self.click("id", target_id, timeout=2)
                    time.sleep(0.4)
                    continue
                time.sleep(0.3)
                continue
            gap = target - current
            if not fine_only and abs(gap) > 8:
                if not self._fling_wheel(col, toward_larger=gap > 0):
                    fine_only = True
                    continue
                after = self._read_wheel_selected(col)
                if after is None or after == current or ((target - after > 0) != (gap > 0)):
                    fine_only = True
                continue
            direction = 1 if gap > 0 else -1
            for step in range(min(abs(gap), 3), 0, -1):
                cand = current + step * direction
                if lo <= cand <= hi and self.is_id_visible(f"time_{col}_{cand}", 1):
                    self.click("id", f"time_{col}_{cand}", timeout=3)
                    time.sleep(0.4)
                    break
            else:
                time.sleep(0.3)
        logger.warning("TimePicker %s did not reach %s (stopped at %s)", col, target, self._read_wheel_selected(col))

    def _fling_wheel(self, col, toward_larger):
        """Momentum-flick the wheel column ~15-20 values toward larger (up) or smaller (down) values; False if the wheel geometry can't be measured."""
        geom = self._wheel_geometry(col)
        if geom is None:
            return False
        col_x, cy, row_px = geom
        span = max(int(row_px * 4), 200)
        if toward_larger:
            y1, y2 = int(cy + span / 2), int(cy - span / 2)
        else:
            y1, y2 = int(cy - span / 2), int(cy + span / 2)
        self._drag(int(col_x), y1, int(col_x), y2)
        time.sleep(0.45)
        return True

    def _wheel_geometry(self, col):
        """(column centre-x, selection-row centre-y, per-value pixel pitch) from the visible wheel cells; None if fewer than two are readable."""
        cells = []
        for attr in self._wheel_attrs():
            try:
                els = self.find_all("xpath", f"//*[contains(@{attr},'time_{col}_')]")
            except Exception:
                els = []
            for el in els:
                rid = el.get_attribute(attr) or el.get_attribute("name") or ""
                match = re.match(rf"time_{col}_(\d+)", rid)
                if not match:
                    continue
                try:
                    rect = el.rect
                except Exception:
                    continue
                cells.append((int(match.group(1)), rect["x"] + rect["width"] / 2, rect["y"] + rect["height"] / 2))
            if cells:
                break
        if len(cells) < 2:
            return None
        cells.sort(key=lambda c: c[0])
        col_x = sum(c[1] for c in cells) / len(cells)
        pitches = [(b[2] - a[2]) / (b[0] - a[0]) for a, b in zip(cells, cells[1:]) if b[0] != a[0]]
        row_px = abs(sum(pitches) / len(pitches)) if pitches else 130.0
        cy = self._selected_row_center_y() or (sum(c[2] for c in cells) / len(cells))
        return col_x, cy, row_px

    def _wheel_attrs(self):
        """Element attributes that carry the wheel item id, by platform."""
        return ("name",) if self.platform == "ios" else ("resource-id", "content-desc")

    def _selected_row_center_y(self):
        """Vertical centre of the picker's selected row, read from whichever column exposes a _selected id."""
        for col in ("minute", "period", "hour"):
            for attr in self._wheel_attrs():
                try:
                    els = self.find_all("xpath", f"//*[contains(@{attr},'time_{col}_') and contains(@{attr},'_selected')]")
                except Exception:
                    els = []
                for el in els:
                    try:
                        rect = el.rect
                        return rect["y"] + rect["height"] / 2
                    except Exception:
                        continue
        return None

    def _read_wheel_selected(self, col):
        """Read the centred value of a TimePicker column: prefer the _selected id, else the item nearest the selected-row centre (the app omits _selected at the hour-wheel boundary)."""
        for attr in self._wheel_attrs():
            try:
                els = self.find_all("xpath", f"//*[contains(@{attr},'time_{col}_') and contains(@{attr},'_selected')]")
            except Exception:
                els = []
            for el in els:
                rid = el.get_attribute(attr) or el.get_attribute("name") or ""
                match = re.search(rf"time_{col}_(\d+)_selected", rid)
                if match:
                    return int(match.group(1))
        center = self._selected_row_center_y()
        if center is None:
            return None
        best, best_dist = None, None
        for attr in self._wheel_attrs():
            try:
                els = self.find_all("xpath", f"//*[contains(@{attr},'time_{col}_')]")
            except Exception:
                els = []
            for el in els:
                rid = el.get_attribute(attr) or el.get_attribute("name") or ""
                match = re.match(rf"time_{col}_(\d+)$", rid)
                if not match:
                    continue
                try:
                    rect = el.rect
                except Exception:
                    continue
                dist = abs((rect["y"] + rect["height"] / 2) - center)
                if best_dist is None or dist < best_dist:
                    best, best_dist = int(match.group(1)), dist
            if best is not None:
                return best
        return best

    def tap_add_action(self):
        """Tap the add-action button on the Create Schedule screen."""
        self.click("add_action_button", timeout=10)
        return self


    def set_action_param(self, param_name, value):
        """Open a named action param, set its value, and return the value actually applied."""
        self.click("id", f"button_schedule_device_param_{param_name}_selection", timeout=3)
        actual = self.set_modal_param_value(param_name, value)
        self.click("param_config_save_button", timeout=3)
        return actual

    def finish_action(self):
        """Leave the params and device-selection screens, back to Create Schedule."""
        self.click("save_params_button", timeout=3)
        self.click("device_selection_done_button", timeout=3)
        return self

    def save_schedule(self):
        """Save the schedule on the Create Schedule screen."""
        self.click("save_schedule_button", timeout=3)
        return self

    def is_create_schedule_screen_displayed(self, timeout=10):
        """True when the Create Schedule screen is shown (its Save control is present)."""
        return self.is_visible("save_schedule_button", timeout=timeout)

    def is_schedule_visible(self, name, timeout=10, attempts=1):
        """True when a schedule card with the given name is listed."""
        return self.is_named_item_visible(f"card_schedule_{name}", "refresh_schedules_button", timeout, attempts)
