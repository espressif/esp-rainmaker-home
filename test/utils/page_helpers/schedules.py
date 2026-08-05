# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""Schedules page helper: create a one-time schedule, set its time, and clean up."""

import datetime
import logging
import re
import time
from xml.etree import ElementTree

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
        self._geom_cache = {}
        for attempt in range(2):
            self._pick_wheel("hour", hour12)
            self._pick_wheel("minute", minute)
            self._pick_wheel("period", period)
            state = self._picker_state()
            got_h = self._read_wheel_selected("hour", state)
            got_m = self._read_wheel_selected("minute", state)
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

    def _pick_wheel(self, col, value, max_rounds=6):
        """Set a TimePicker wheel with distance-computed drags (a momentum flick coasts ~5 values on iOS vs 15+ on Android, making blind flicking unusable there), then tap for the exact landing."""
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
        for _ in range(max_rounds):
            state = self._picker_state()
            current = self._read_wheel_selected(col, state)
            if current == target:
                if state["selected"].get(col) != target and target in state["plain"][col]:
                    self.click("id", target_id, timeout=2)
                    time.sleep(0.3)
                return
            if current is None:
                if target in state["plain"][col]:
                    self.click("id", target_id, timeout=2)
                    time.sleep(0.4)
                    continue
                time.sleep(0.3)
                continue
            gap = target - current
            if abs(gap) > 3 and self._drag_wheel_by(col, gap, state):
                continue
            for step in range(min(abs(gap), 3), 0, -1):
                cand = current + step * (1 if gap > 0 else -1)
                if lo <= cand <= hi and cand in state["plain"][col]:
                    self.click("id", f"time_{col}_{cand}", timeout=3)
                    time.sleep(0.4)
                    break
            else:
                time.sleep(0.3)
        logger.warning("TimePicker %s did not reach %s (stopped at %s)", col, target, self._read_wheel_selected(col))

    def _drag_wheel_by(self, col, gap, state=None):
        """Move the wheel by exactly `gap` values as a batch of chunked, momentum-free drags computed from the wheel pitch — one state read per batch instead of one per flick; False if the wheel geometry can't be measured."""
        geom = self._wheel_geometry(col, state)
        if geom is None:
            return False
        col_x, cy, row_px = geom
        remaining = gap
        while remaining:
            chunk = max(-4, min(4, remaining))
            span = abs(chunk) * row_px
            direction = 1 if chunk > 0 else -1
            y1 = int(cy + direction * span / 2)
            y2 = int(cy - direction * span / 2)
            self._drag(int(col_x), y1, int(col_x), y2)
            remaining -= chunk
            time.sleep(0.35)
        time.sleep(0.3)
        return True

    _CELL_ID = re.compile(r"time_(hour|minute|period)_(\d+|AM|PM)(_selected)?$")

    def _picker_state(self):
        """Every visible TimePicker cell from ONE page-source snapshot (cell centres, plain-id values, selected value per column) — one snapshot beats the per-element find/attribute/rect round-trips XCUITest is too slow for."""
        state = {"cells": {"hour": {}, "minute": {}, "period": {}},
                 "plain": {"hour": set(), "minute": set(), "period": set()},
                 "selected": {}}
        try:
            root = ElementTree.fromstring(self.driver.page_source.encode("utf-8"))
        except Exception as error:
            logger.warning("TimePicker page-source read failed: %s", error)
            return state
        attrs = self._wheel_attrs()
        for el in root.iter():
            if el.attrib.get("visible") == "false" or el.attrib.get("displayed") == "false":
                continue
            rid = next((el.attrib[a] for a in attrs if el.attrib.get(a)), "")
            match = self._CELL_ID.search(rid)
            if not match:
                continue
            center = self._el_center(el.attrib)
            if center is None:
                continue
            col, raw, selected = match.group(1), match.group(2), bool(match.group(3))
            value = raw if col == "period" else int(raw)
            state["cells"][col][value] = center
            if selected:
                state["selected"][col] = value
            else:
                state["plain"][col].add(value)
        return state

    @staticmethod
    def _el_center(attrib):
        """Element centre from source attributes: uia2 bounds=\"[x1,y1][x2,y2]\" or XCUITest x/y/width/height."""
        match = re.match(r"\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]", attrib.get("bounds", ""))
        if match:
            x1, y1, x2, y2 = (int(g) for g in match.groups())
            return ((x1 + x2) / 2, (y1 + y2) / 2)
        try:
            x, y = float(attrib["x"]), float(attrib["y"])
            w, h = float(attrib["width"]), float(attrib["height"])
        except (KeyError, ValueError):
            return None
        return (x + w / 2, y + h / 2)

    @staticmethod
    def _selected_center_y(state, exclude=None):
        """Vertical centre of the selected row, from whichever OTHER column exposes a _selected id (period first: its buttons don't scroll, so their row anchor is valid even if which-one-is-selected is stale)."""
        for col in ("period", "minute", "hour"):
            if col == exclude:
                continue
            value = state["selected"].get(col)
            if value is not None:
                return state["cells"][col][value][1]
        return None

    @staticmethod
    def _row_pitch(cells):
        ys = sorted(center[1] for center in cells.values())
        gaps = [b - a for a, b in zip(ys, ys[1:]) if b - a > 1]
        return min(gaps) if gaps else 130.0

    def _read_wheel_selected(self, col, state=None):
        """Centred value of a TimePicker column. The _selected id is used only if its cell actually sits on the selection row — iOS keeps stale mount-time identifiers (e.g. time_hour_12_selected while the wheel shows 1), so it cannot be trusted alone. Fallback: the cell nearest the selection row."""
        state = state or self._picker_state()
        cells = state["cells"][col]
        anchor = self._selected_center_y(state, exclude=col)
        value = state["selected"].get(col)
        if value is not None and value in cells:
            if anchor is None or abs(cells[value][1] - anchor) <= self._row_pitch(cells) * 0.6:
                return value
            logger.warning("TimePicker %s: ignoring stale _selected id %s (cell is off the selection row)", col, value)
        if anchor is None or not cells:
            return value
        return min(cells.items(), key=lambda item: abs(item[1][1] - anchor))[0]

    def _wheel_geometry(self, col, state=None):
        """(column centre-x, selection-row centre-y, per-value pixel pitch), cached per column; None if fewer than two cells are readable."""
        cache = getattr(self, "_geom_cache", None)
        if cache is None:
            cache = self._geom_cache = {}
        if col in cache:
            return cache[col]
        state = state or self._picker_state()
        cells = sorted((value, center) for value, center in state["cells"][col].items() if isinstance(value, int))
        if len(cells) < 2:
            return None
        col_x = sum(center[0] for _, center in cells) / len(cells)
        pitches = [(b[1][1] - a[1][1]) / (b[0] - a[0]) for a, b in zip(cells, cells[1:]) if b[0] != a[0]]
        row_px = abs(sum(pitches) / len(pitches)) if pitches else 130.0
        cy = self._selected_center_y(state) or (sum(center[1] for _, center in cells) / len(cells))
        cache[col] = (col_x, cy, row_px)
        return cache[col]

    def _wheel_attrs(self):
        """Element attributes that carry the wheel item id, by platform."""
        return ("name",) if self.platform == "ios" else ("resource-id", "content-desc")

    def tap_add_action(self):
        """Tap the add-action button on the Create Schedule screen."""
        self.click("add_action_button", timeout=10)
        return self


    def set_action_param(self, param_name, value):
        """Open a named action param, set its value, and return the value actually applied."""
        self.open_param_editor(f"button_schedule_device_param_{param_name}_selection", "param_config_save_button")
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
