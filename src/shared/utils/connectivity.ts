/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TFunction } from "i18next";
import {
  EPOCH_SECONDS_MAX,
  LAST_SEEN_UNIT_DAYS,
  LAST_SEEN_UNIT_HOURS,
  LAST_SEEN_UNIT_MINUTES,
  LAST_SEEN_UNIT_SECONDS,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
} from "@shared/utils/constants";

export type LastSeenUnit =
  | typeof LAST_SEEN_UNIT_SECONDS
  | typeof LAST_SEEN_UNIT_MINUTES
  | typeof LAST_SEEN_UNIT_HOURS
  | typeof LAST_SEEN_UNIT_DAYS;

/**
 * Normalizes a connectivity timestamp to epoch milliseconds.
 * Values below {@link EPOCH_SECONDS_MAX} are treated as seconds.
 *
 * @param timestamp - Raw last-connection timestamp (sec or ms)
 * @returns Epoch ms, or `null` when the input is missing/invalid
 */
export function normalizeConnectionTimestampMs(
  timestamp: number | undefined | null,
): number | null {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }
  return timestamp < EPOCH_SECONDS_MAX ? timestamp * MS_PER_SECOND : timestamp;
}

/**
 * Buckets elapsed time since last connection into a count + unit for i18n.
 *
 * @param timestampMs - Last connection time in epoch ms
 * @param nowMs - Reference "now" (defaults to `Date.now()`)
 * @returns Count/unit for relative copy, or `null` if elapsed cannot be computed
 */
export function getLastSeenAgoParts(
  timestampMs: number,
  nowMs: number = Date.now(),
): { count: number; unit: LastSeenUnit } | null {
  const elapsedMs = Math.max(0, nowMs - timestampMs);
  if (elapsedMs < MS_PER_MINUTE) {
    return {
      count: Math.max(1, Math.floor(elapsedMs / MS_PER_SECOND)),
      unit: LAST_SEEN_UNIT_SECONDS,
    };
  }
  if (elapsedMs < MS_PER_HOUR) {
    return {
      count: Math.floor(elapsedMs / MS_PER_MINUTE),
      unit: LAST_SEEN_UNIT_MINUTES,
    };
  }
  if (elapsedMs < MS_PER_DAY) {
    return {
      count: Math.floor(elapsedMs / MS_PER_HOUR),
      unit: LAST_SEEN_UNIT_HOURS,
    };
  }
  return {
    count: Math.floor(elapsedMs / MS_PER_DAY),
    unit: LAST_SEEN_UNIT_DAYS,
  };
}

/**
 * Builds offline copy including last-seen when available (Device Control banner, DeviceCard).
 *
 * @param lastConnectionTimestamp - Raw CDF connectivity timestamp (sec or ms)
 * @param t - i18n `t` function
 * @returns Localized offline message
 */
export function resolveOfflineBannerMessage(
  lastConnectionTimestamp: number | undefined | null,
  t: TFunction,
): string {
  const timestampMs = normalizeConnectionTimestampMs(lastConnectionTimestamp);
  if (timestampMs == null) {
    return t("layout.shared.offline");
  }
  const parts = getLastSeenAgoParts(timestampMs);
  if (parts == null) {
    return t("layout.shared.offline");
  }
  const timeAgo = t(`layout.shared.lastSeen.${parts.unit}`, {
    count: parts.count,
  });
  return t("layout.shared.offlineLastSeen", { timeAgo });
}
