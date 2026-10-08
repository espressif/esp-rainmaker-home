/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Zap } from "lucide-react-native";

import { useHostBattery } from "@features/embed/hooks";
import { tokens } from "@shared/theme/tokens";
import {
  WEB_EMBED_DOCUMENT_VISIBILITY_EVENT,
  WEB_EMBED_DOCUMENT_VISIBILITY_VISIBLE,
  WEB_EMBED_STATUS_BAR_PADDING_X,
  WEB_EMBED_STATUS_CLOCK_INTERVAL_MS,
  WEB_EMBED_WINDOW_FOCUS_EVENT,
} from "@shared/utils/constants";

export interface EmbedStatusBarProps {
  /** Height of the top safe inset row */
  height: number;
}

/**
 * Formats the current local time like an iOS status-bar clock.
 * @returns Time string such as `"9:41"`
 */
function formatStatusClock(): string {
  const now = new Date();
  return now.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Milliseconds until the next wall-clock minute so the status bar flips on time.
 * @returns Delay until `:00` of the next minute
 */
function msUntilNextMinute(): number {
  return WEB_EMBED_STATUS_CLOCK_INTERVAL_MS - (Date.now() % WEB_EMBED_STATUS_CLOCK_INTERVAL_MS);
}

/**
 * iPhone-style status row for the embed top inset: live clock + host battery
 * from the Battery Status API (Chrome/Edge). Hides battery when unsupported.
 * Clock aligns to minute boundaries and refreshes on tab visibility/focus so
 * backgrounded tabs do not show a stale time.
 * @param props - Status bar layout props
 * @param props.height - Safe-inset height for vertical centering
 */
export function EmbedStatusBar({ height }: EmbedStatusBarProps) {
  const { percent, charging } = useHostBattery();
  const [clock, setClock] = useState(formatStatusClock);

  useEffect(() => {
    /** Writes the current local time into React state. */
    const refresh = () => setClock(formatStatusClock());
    refresh();

    let intervalId: ReturnType<typeof setInterval> | undefined;
    const timeoutId = setTimeout(() => {
      refresh();
      intervalId = setInterval(refresh, WEB_EMBED_STATUS_CLOCK_INTERVAL_MS);
    }, msUntilNextMinute());

    /** Refreshes immediately when the tab becomes visible again. */
    const onVisibilityChange = () => {
      if (document.visibilityState === WEB_EMBED_DOCUMENT_VISIBILITY_VISIBLE) {
        refresh();
      }
    };

    document.addEventListener(
      WEB_EMBED_DOCUMENT_VISIBILITY_EVENT,
      onVisibilityChange,
    );
    window.addEventListener(WEB_EMBED_WINDOW_FOCUS_EVENT, refresh);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId !== undefined) {
        clearInterval(intervalId);
      }
      document.removeEventListener(
        WEB_EMBED_DOCUMENT_VISIBILITY_EVENT,
        onVisibilityChange,
      );
      window.removeEventListener(WEB_EMBED_WINDOW_FOCUS_EVENT, refresh);
    };
  }, []);

  const fillWidth = percent == null ? 0 : Math.round(18 * (percent / 100));

  return (
    <View
      pointerEvents="none"
      style={[styles.row, { height, paddingHorizontal: WEB_EMBED_STATUS_BAR_PADDING_X }]}
      accessibilityLabel="iPhone status bar"
    >
      <Text style={styles.clock}>{clock}</Text>
      <View style={styles.spacer} />
      {percent != null ? (
        <View style={styles.batteryCluster}>
          <Text style={styles.percent}>{percent}%</Text>
          <View style={styles.batteryBody}>
            <View style={[styles.batteryFill, { width: fillWidth }]} />
            {charging ? (
              <View style={styles.boltWrap}>
                <Zap
                  size={9}
                  color={tokens.colors.black}
                  fill={tokens.colors.black}
                />
              </View>
            ) : null}
          </View>
          <View style={styles.batteryCap} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 3,
    flexDirection: "row",
    alignItems: "center",
  },
  clock: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.black,
  },
  spacer: {
    flex: 1,
  },
  batteryCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  percent: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.black,
  },
  batteryBody: {
    width: 22,
    height: 10,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: tokens.colors.black,
    padding: 1,
    justifyContent: "center",
    overflow: "hidden",
  },
  batteryFill: {
    height: "100%",
    borderRadius: 1,
    backgroundColor: tokens.colors.black,
  },
  boltWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  batteryCap: {
    width: 2,
    height: 4,
    borderTopRightRadius: 1,
    borderBottomRightRadius: 1,
    backgroundColor: tokens.colors.black,
  },
});
