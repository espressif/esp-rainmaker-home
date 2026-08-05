/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ChartGranularity,
  TimeSeriesBucketBoundary,
} from "@src/types/global";
import {
  CHART_GRANULARITY_MONTHLY,
  CHART_GRANULARITY_WEEKLY,
  CHART_WEEK_START_DAY_INDEX,
  CHART_WINDOW_BUCKET_COUNT,
} from "@features/control/constants";
import { formatBucketLabel } from "./timeSeriesFormat";

/**
 * Aligns a timestamp to the start of the calendar bucket that contains it
 * (day, week, or month), in device-local time. Uses Date arithmetic so DST
 * transitions keep buckets aligned to local midnights.
 * @param timestampMs - Unix timestamp in milliseconds
 * @param granularity - Bucket size (daily/weekly/monthly)
 * @returns Bucket start timestamp in milliseconds
 */
export const alignToBucketStart = (
  timestampMs: number,
  granularity: ChartGranularity,
): number => {
  const date = new Date(timestampMs);
  date.setHours(0, 0, 0, 0);
  if (granularity === CHART_GRANULARITY_WEEKLY) {
    const day = date.getDay();
    const diff =
      (day < CHART_WEEK_START_DAY_INDEX ? 7 : 0) +
      day -
      CHART_WEEK_START_DAY_INDEX;
    date.setDate(date.getDate() - diff);
  } else if (granularity === CHART_GRANULARITY_MONTHLY) {
    date.setDate(1);
  }
  return date.getTime();
};

/**
 * Returns the start of the bucket that is `count` buckets after the given
 * bucket start (negative counts step backwards).
 * @param bucketStartMs - A bucket start timestamp in milliseconds
 * @param granularity - Bucket size (daily/weekly/monthly)
 * @param count - Number of buckets to step (may be negative)
 * @returns The shifted bucket start timestamp in milliseconds
 */
export const addBuckets = (
  bucketStartMs: number,
  granularity: ChartGranularity,
  count: number,
): number => {
  const date = new Date(bucketStartMs);
  if (granularity === CHART_GRANULARITY_MONTHLY) {
    date.setMonth(date.getMonth() + count);
  } else {
    const days = granularity === CHART_GRANULARITY_WEEKLY ? count * 7 : count;
    date.setDate(date.getDate() + days);
  }
  return date.getTime();
};

/**
 * Computes the bucket boundaries of one chart window.
 *
 * A window holds {@link CHART_WINDOW_BUCKET_COUNT} consecutive buckets. With
 * `windowOffset` 0 the window ends at the bucket containing `now`; each
 * offset step pages one full window back in time.
 * @param granularity - Bucket size (daily/weekly/monthly)
 * @param windowOffset - Number of windows to page back from now (0 = latest)
 * @param nowMs - Reference "now" timestamp in milliseconds
 * @returns Ordered (oldest → newest) bucket boundaries with x-axis labels
 */
export const computeWindowBuckets = (
  granularity: ChartGranularity,
  windowOffset: number,
  nowMs: number,
): TimeSeriesBucketBoundary[] => {
  const currentBucketStart = alignToBucketStart(nowMs, granularity);
  const newestBucketStart = addBuckets(
    currentBucketStart,
    granularity,
    -windowOffset * CHART_WINDOW_BUCKET_COUNT,
  );

  const boundaries: TimeSeriesBucketBoundary[] = [];
  for (let i = CHART_WINDOW_BUCKET_COUNT - 1; i >= 0; i--) {
    const start = addBuckets(newestBucketStart, granularity, -i);
    const end = addBuckets(start, granularity, 1);
    boundaries.push({
      start,
      end,
      label: formatBucketLabel(start, granularity),
    });
  }
  return boundaries;
};

/**
 * Finds the index of the bucket containing a timestamp.
 * @param timestampMs - Unix timestamp in milliseconds
 * @param boundaries - Ordered bucket boundaries of the window
 * @returns Bucket index, or -1 when the timestamp falls outside the window
 */
export const bucketIndexFor = (
  timestampMs: number,
  boundaries: TimeSeriesBucketBoundary[],
): number =>
  boundaries.findIndex(
    (bucket) => timestampMs >= bucket.start && timestampMs < bucket.end,
  );
