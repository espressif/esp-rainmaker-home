/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFAggregationMethod } from "@store";

import type {
  TimeSeriesBucket,
  TimeSeriesBucketBoundary,
  TimeSeriesSummary,
} from "@src/types/global";
import {
  DATA_TYPE_FLOAT,
  DATA_TYPE_INT,
  ESPRM_ENERGY_PARAM_TYPE,
} from "@shared/utils/constants";
import {
  TS_SUMMARY_KIND_AVERAGE,
  TS_SUMMARY_KIND_TOTAL,
} from "@features/control/constants";
import { bucketIndexFor } from "./timeSeriesWindows";

/**
 * A raw time-series point normalized for bucketing.
 */
export interface TimeSeriesPoint {
  /** Unix timestamp in milliseconds */
  timestampMs: number;
  /** Numeric value of the point */
  value: number;
}

/**
 * Param types with cumulative (meter-style) semantics: their charts show
 * consumption per bucket, not an average of absolute readings. The RMNG
 * adaptor projects `Sum` from the window's consumption value for cumulative
 * params, so this stays correct for monotonically increasing meters.
 */
const CUMULATIVE_PARAM_TYPES: string[] = [ESPRM_ENERGY_PARAM_TYPE];

/**
 * Resolves the aggregation method used for a param's chart, since the
 * revamped UI has no manual aggregation picker: cumulative param types
 * (e.g. energy meters) sum consumption per bucket, other numeric params
 * average per bucket, everything else counts reports per bucket.
 * @param dataType - The param's data type (float/int/bool/string)
 * @param paramType - The param's type identifier (e.g. "esp.param.energy")
 * @returns Aggregation method applied server-side or client-side per bucket
 */
export const resolveAggregation = (
  dataType?: string,
  paramType?: string
): ESPCDFAggregationMethod => {
  if (paramType && CUMULATIVE_PARAM_TYPES.includes(paramType)) {
    return ESPCDFAggregationMethod.Sum;
  }
  const normalized = dataType?.toLowerCase();
  if (normalized === DATA_TYPE_FLOAT || normalized === DATA_TYPE_INT) {
    return ESPCDFAggregationMethod.Avg;
  }
  return ESPCDFAggregationMethod.Count;
};

/**
 * Applies an aggregation method to the raw values of one bucket.
 * @param values - Raw numeric values reported inside the bucket
 * @param method - Aggregation method to apply
 * @returns Aggregated bucket value
 */
const aggregateValues = (
  values: number[],
  method: ESPCDFAggregationMethod
): number => {
  switch (method) {
    case ESPCDFAggregationMethod.Count:
      return values.length;
    case ESPCDFAggregationMethod.Sum:
      return values.reduce((total, value) => total + value, 0);
    default: {
      const sum = values.reduce((total, value) => total + value, 0);
      return sum / values.length;
    }
  }
};

/**
 * Reduces raw (unaggregated) points into window buckets — the client-side
 * equivalent of server aggregation, used for `simple_ts` params whose
 * endpoint cannot aggregate.
 * @param points - Raw points (any order); points outside the window are ignored
 * @param boundaries - Ordered bucket boundaries of the window
 * @param method - Aggregation method to apply per bucket
 * @returns One bucket per boundary, `value: null` where no points landed
 */
export const reducePointsIntoBuckets = (
  points: TimeSeriesPoint[],
  boundaries: TimeSeriesBucketBoundary[],
  method: ESPCDFAggregationMethod
): TimeSeriesBucket[] => {
  const valuesPerBucket: number[][] = boundaries.map(() => []);
  for (const point of points) {
    const index = bucketIndexFor(point.timestampMs, boundaries);
    if (index >= 0) {
      valuesPerBucket[index].push(point.value);
    }
  }
  return boundaries.map((boundary, index) => ({
    ...boundary,
    value:
      valuesPerBucket[index].length > 0
        ? aggregateValues(valuesPerBucket[index], method)
        : null,
  }));
};

/**
 * Places server-aggregated points (one value per interval) into window
 * buckets by their timestamps, used for `time_series` params.
 * @param points - Server-aggregated points (bucket-start timestamps)
 * @param boundaries - Ordered bucket boundaries of the window
 * @returns One bucket per boundary, `value: null` where no point landed
 */
export const mapAggregatedPointsToBuckets = (
  points: TimeSeriesPoint[],
  boundaries: TimeSeriesBucketBoundary[]
): TimeSeriesBucket[] => {
  const values: (number | null)[] = boundaries.map(() => null);
  for (const point of points) {
    const index = bucketIndexFor(point.timestampMs, boundaries);
    if (index >= 0) {
      values[index] = point.value;
    }
  }
  return boundaries.map((boundary, index) => ({
    ...boundary,
    value: values[index],
  }));
};

/**
 * Summarizes the visible window for the header: averaging aggregations show
 * the window average, counting/summing aggregations show the window total.
 * @param buckets - Buckets of the visible window
 * @param method - Aggregation method the buckets were built with
 * @returns Window summary (`value: null` when every bucket is empty)
 */
export const summarizeBuckets = (
  buckets: TimeSeriesBucket[],
  method: ESPCDFAggregationMethod
): TimeSeriesSummary => {
  const values = buckets
    .map((bucket) => bucket.value)
    .filter((value): value is number => value !== null);

  if (values.length === 0) {
    return { value: null, kind: TS_SUMMARY_KIND_TOTAL };
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  if (method === ESPCDFAggregationMethod.Avg) {
    return { value: total / values.length, kind: TS_SUMMARY_KIND_AVERAGE };
  }
  return { value: total, kind: TS_SUMMARY_KIND_TOTAL };
};
