/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";

import {
  WEB_EMBED_BATTERY_EVENT_CHARGING,
  WEB_EMBED_BATTERY_EVENT_LEVEL,
  WEB_EMBED_BATTERY_POLL_INTERVAL_MS,
  WEB_EMBED_DOCUMENT_VISIBILITY_EVENT,
  WEB_EMBED_DOCUMENT_VISIBILITY_VISIBLE,
  WEB_EMBED_WINDOW_FOCUS_EVENT,
} from "@shared/utils/constants";

/** Host device battery snapshot for the embed status bar */
export interface HostBatteryState {
  /** Charge level 0–100, or null when the Battery Status API is unavailable */
  percent: number | null;
  /** True when the host is plugged in and charging */
  charging: boolean;
}

/** Minimal Battery Status API shape (Chromium); not in all TS lib.dom versions */
interface HostBatteryManager extends EventTarget {
  readonly level: number;
  readonly charging: boolean;
}

interface NavigatorWithBattery {
  getBattery?: () => Promise<HostBatteryManager>;
}

/**
 * Reads the host laptop/phone battery via the Battery Status API and keeps it
 * in sync for the iPhone-frame status inset. Listens for level/charging events,
 * polls as a fallback (Chromium often delays `levelchange`), and re-syncs on
 * tab visibility/focus. No-ops when unsupported.
 * @returns Current percent and charging flag
 */
export function useHostBattery(): HostBatteryState {
  const [percent, setPercent] = useState<number | null>(null);
  const [charging, setCharging] = useState(false);

  useEffect(() => {
    const nav = navigator as NavigatorWithBattery;
    if (typeof nav.getBattery !== "function") {
      return;
    }

    let cancelled = false;
    let battery: HostBatteryManager | null = null;
    let pollId: ReturnType<typeof setInterval> | undefined;

    /** Pushes the latest battery manager values into React state. */
    const sync = () => {
      if (!battery || cancelled) {
        return;
      }
      setPercent(Math.round(battery.level * 100));
      setCharging(battery.charging);
    };

    /** Re-reads battery when the tab is foregrounded again. */
    const onVisibilityChange = () => {
      if (document.visibilityState === WEB_EMBED_DOCUMENT_VISIBILITY_VISIBLE) {
        sync();
      }
    };

    void nav.getBattery().then((manager) => {
      if (cancelled) {
        return;
      }
      battery = manager;
      sync();
      manager.addEventListener(WEB_EMBED_BATTERY_EVENT_LEVEL, sync);
      manager.addEventListener(WEB_EMBED_BATTERY_EVENT_CHARGING, sync);
      pollId = setInterval(sync, WEB_EMBED_BATTERY_POLL_INTERVAL_MS);
      document.addEventListener(
        WEB_EMBED_DOCUMENT_VISIBILITY_EVENT,
        onVisibilityChange,
      );
      window.addEventListener(WEB_EMBED_WINDOW_FOCUS_EVENT, sync);
    });

    return () => {
      cancelled = true;
      if (pollId !== undefined) {
        clearInterval(pollId);
      }
      document.removeEventListener(
        WEB_EMBED_DOCUMENT_VISIBILITY_EVENT,
        onVisibilityChange,
      );
      window.removeEventListener(WEB_EMBED_WINDOW_FOCUS_EVENT, sync);
      if (battery) {
        battery.removeEventListener(WEB_EMBED_BATTERY_EVENT_LEVEL, sync);
        battery.removeEventListener(WEB_EMBED_BATTERY_EVENT_CHARGING, sync);
      }
    };
  }, []);

  return { percent, charging };
}
