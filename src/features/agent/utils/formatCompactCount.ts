/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { tokens } from "@shared/theme/tokens";
import {
  AGENT_USAGE_PERCENT_BLUE_MAX,
  AGENT_USAGE_PERCENT_GREEN_MAX,
  AGENT_USAGE_PERCENT_WARNING_MAX,
} from "./constants";

const COMPACT_COUNT_SUFFIX_BILLION = "b";
const COMPACT_COUNT_SUFFIX_MILLION = "m";
const COMPACT_COUNT_SUFFIX_THOUSAND = "k";
const COMPACT_COUNT_BILLION = 1_000_000_000;
const COMPACT_COUNT_MILLION = 1_000_000;
const COMPACT_COUNT_THOUSAND = 1_000;

/**
 * Formats large token counts into short labels (e.g. 1k, 200k, 1.2m, 1b).
 * @param value - Raw usage or quota count from the agents API.
 * @returns Compact string representation.
 */
export function formatCompactCount(value: number): string {
  const abs = Math.abs(value);

  if (abs >= COMPACT_COUNT_BILLION) {
    return formatWithSuffix(value, COMPACT_COUNT_BILLION, COMPACT_COUNT_SUFFIX_BILLION);
  }

  if (abs >= COMPACT_COUNT_MILLION) {
    return formatWithSuffix(value, COMPACT_COUNT_MILLION, COMPACT_COUNT_SUFFIX_MILLION);
  }

  if (abs >= COMPACT_COUNT_THOUSAND) {
    return formatWithSuffix(value, COMPACT_COUNT_THOUSAND, COMPACT_COUNT_SUFFIX_THOUSAND);
  }

  return String(Math.round(value));
}

/**
 * Picks gradient endpoint colors for the usage stripe based on fill percentage.
 * @param percentage - Current usage as a percentage of the quota limit.
 * @returns Two-color gradient tuple for the filled portion.
 */
export function getUsageStripeGradient(
  percentage: number,
): readonly [string, string] {
  const pct = Math.max(0, Math.min(100, percentage));

  if (pct >= AGENT_USAGE_PERCENT_WARNING_MAX) {
    return [tokens.colors.error, tokens.colors.red] as const;
  }

  if (pct >= AGENT_USAGE_PERCENT_GREEN_MAX) {
    return [tokens.colors.warn, tokens.colors.orange] as const;
  }

  if (pct >= AGENT_USAGE_PERCENT_BLUE_MAX) {
    return [tokens.colors.success, tokens.colors.green] as const;
  }

  return [tokens.colors.primary, tokens.colors.bluetooth] as const;
}

/**
 * Builds a compact count label with the appropriate unit suffix.
 * @param value - Numeric value to format.
 * @param divisor - Unit divisor (1k, 1m, or 1b).
 * @param suffix - Suffix letter(s) appended to the scaled value.
 * @returns Formatted compact string.
 */
function formatWithSuffix(value: number, divisor: number, suffix: string): string {
  const scaled = value / divisor;
  const rounded = Math.round(scaled * 10) / 10;
  const display =
    Number.isInteger(rounded) || rounded >= 10
      ? String(Math.round(rounded))
      : String(rounded);
  return `${display}${suffix}`;
}
