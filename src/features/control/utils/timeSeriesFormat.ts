/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChartGranularity } from "@src/types/global";
import { ESPRM_TEMPERATURE_PARAM_TYPE } from "@shared/utils/constants";
import {
  CHART_GRANULARITY_MONTHLY,
  CHART_GRANULARITY_WEEKLY,
} from "@features/control/constants";

/**
 * Formats a day-of-month as two digits (e.g. 7 → "07").
 * @param date - The date to read the day from
 * @returns Two-digit day string
 */
const twoDigitDay = (date: Date): string =>
  String(date.getDate()).padStart(2, "0");

/**
 * Short device-locale month name (e.g. "Jul").
 * @param date - The date to read the month from
 * @returns Short month string
 */
const shortMonth = (date: Date): string =>
  date.toLocaleDateString(undefined, { month: "short" });

/**
 * Two-digit year (e.g. 2026 → "26").
 * @param date - The date to read the year from
 * @returns Two-digit year string
 */
const twoDigitYear = (date: Date): string =>
  String(date.getFullYear() % 100).padStart(2, "0");

/**
 * Formats the x-axis label of one bucket, per the revamp design:
 * daily "12 Jul", weekly "07-13 Jul" (or "28 Jun-04 Jul" across months),
 * monthly "Jul'26". The same label doubles as the tooltip's period line.
 * @param bucketStartMs - Bucket start timestamp in milliseconds
 * @param granularity - Bucket size (daily/weekly/monthly)
 * @returns Short label for the bucket
 */
export const formatBucketLabel = (
  bucketStartMs: number,
  granularity: ChartGranularity
): string => {
  const start = new Date(bucketStartMs);
  if (granularity === CHART_GRANULARITY_MONTHLY) {
    return `${shortMonth(start)}'${twoDigitYear(start)}`;
  }
  if (granularity === CHART_GRANULARITY_WEEKLY) {
    const end = new Date(bucketStartMs);
    end.setDate(end.getDate() + 6);
    if (start.getMonth() === end.getMonth()) {
      return `${twoDigitDay(start)}-${twoDigitDay(end)} ${shortMonth(end)}`;
    }
    return `${twoDigitDay(start)} ${shortMonth(start)}-${twoDigitDay(end)} ${shortMonth(end)}`;
  }
  return `${twoDigitDay(start)} ${shortMonth(start)}`;
};

/**
 * Formats one boundary of the window range label as "07-Jun-26".
 * @param timestampMs - Timestamp in milliseconds
 * @returns Formatted date string
 */
const formatRangeDate = (timestampMs: number): string => {
  const date = new Date(timestampMs);
  return `${twoDigitDay(date)}-${shortMonth(date)}-${twoDigitYear(date)}`;
};

/**
 * Formats the visible window range as "07-Jun-26 to 25-Jul-26".
 * The end boundary is exclusive, so the label shows its last contained day.
 * @param windowStartMs - Window start (inclusive), milliseconds
 * @param windowEndMs - Window end (exclusive), milliseconds
 * @param separator - Localized separator word (e.g. "to")
 * @returns Formatted range label
 */
export const formatWindowRangeLabel = (
  windowStartMs: number,
  windowEndMs: number,
  separator: string
): string =>
  `${formatRangeDate(windowStartMs)} ${separator} ${formatRangeDate(windowEndMs - 1)}`;

/**
 * Formats a chart value for display: at most one decimal place, with the
 * param unit appended (e.g. 76.44 + "°" → "76.4°").
 * @param value - Numeric value, or null when there is no data
 * @param unit - Unit suffix (may be empty)
 * @param emptyPlaceholder - Text to show when value is null
 * @returns Display string for summaries and tooltips
 */
export const formatChartValue = (
  value: number | null,
  unit: string,
  emptyPlaceholder: string
): string => {
  if (value === null || !Number.isFinite(value)) {
    return emptyPlaceholder;
  }
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1);
  return `${text}${unit}`;
};

/**
 * Returns the display unit for a standard param type ("" when unknown).
 * Extend the map as more standard types gain units.
 * @param paramType - Standard param type (e.g. "esp.param.temperature")
 * @returns Unit suffix for chart values
 */
export const getParamUnit = (paramType?: string): string => {
  const unitMap: Record<string, string> = {
    [ESPRM_TEMPERATURE_PARAM_TYPE]: "°",
  };
  return (paramType && unitMap[paramType]) || "";
};
