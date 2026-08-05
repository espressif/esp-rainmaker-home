/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ESPCDFAggregationInterval,
    ESPCDFAggregationMethod,
    ESPCDFSimpleTSDataResponse,
    ESPCDFTSData,
} from "@store";

/**
 * Platform-neutral time-series aggregates contract.
 *
 * RainMaker classic (`getSimpleTSDataAggregates`) and RainMaker NextGen
 * (`getTSData`) expose server-computed window aggregates with the same model:
 * the same four windows, `YYYY-MM-DD` date ranges, and an identical per-window
 * stat set. This module holds everything about that model that is not
 * SDK-specific — the mapping from the CDF chart request, the projection of one
 * stat per window, and the flattening into the `ESPCDFSimpleTSDataResponse`
 * shape the chart consumes — so each platform adaptor only converts between
 * its own SDK types and these.
 */

/** Aggregation windows shared by the RM and RMNG aggregates APIs (wire values). */
export type AggregationWindow = "hourly" | "daily" | "weekly" | "monthly";

/** Per-window statistics common to both platforms (camelCased by both SDKs). */
export interface NormalizedWindowStats {
    count?: number;
    sum?: number;
    min?: number;
    max?: number;
    average?: number;
    firstValue?: number;
    lastValue?: number;
    /** Consumption within the window (cumulative/meter params only). */
    cumulativeValue?: number;
}

/** One aggregate window, reduced to what the CDF projection needs. */
export interface NormalizedWindowEntry {
    /** Window start as Unix seconds (the chart multiplies by 1000 itself). */
    windowStartSec: number;
    /** True for meter-style cumulative params. */
    isCumulative?: boolean;
    stats: NormalizedWindowStats;
}

const INTERVAL_TO_WINDOW: Partial<
    Record<ESPCDFAggregationInterval, AggregationWindow>
> = {
    [ESPCDFAggregationInterval.Hour]: "hourly",
    [ESPCDFAggregationInterval.Day]: "daily",
    [ESPCDFAggregationInterval.Week]: "weekly",
    [ESPCDFAggregationInterval.Month]: "monthly",
};

/**
 * Maps a CDF aggregation interval to the servers' aggregation window.
 * `Minute` and `Year` have no server window on either platform (the chart UI
 * never requests them); an unmapped or missing interval throws rather than
 * silently querying the wrong window.
 */
export function mapIntervalToWindow(
    interval?: ESPCDFAggregationInterval,
): AggregationWindow {
    const window = interval && INTERVAL_TO_WINDOW[interval];
    if (!window) {
        throw new Error(
            `Time-series aggregates support Hour/Day/Week/Month intervals only, got: ${interval}`,
        );
    }
    return window;
}

/**
 * Formats a Unix-seconds timestamp as a `YYYY-MM-DD` calendar date in the
 * phone-local timezone — the same clock the chart used to compute the window,
 * and the format both platforms' aggregates APIs take instead of epochs.
 */
export function epochSecondsToLocalDate(epochSeconds: number): string {
    const date = new Date(epochSeconds * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Projects the single statistic the chart asked for out of a window's stat
 * set. `Sum` prefers `cumulativeValue` for cumulative (meter) params, where
 * plain `sum` would total absolute readings instead of consumption. A missing
 * aggregate defaults to `average` (the chart always sends one; the default
 * matches its numeric-param behavior). `Raw` has no window projection —
 * raw queries go through the raw endpoint, not aggregates.
 */
export function projectWindowStat(
    entry: NormalizedWindowEntry,
    aggregate?: ESPCDFAggregationMethod,
): number | undefined {
    const { stats } = entry;
    switch (aggregate) {
        case ESPCDFAggregationMethod.Count:
            return stats.count;
        case ESPCDFAggregationMethod.Min:
            return stats.min;
        case ESPCDFAggregationMethod.Max:
            return stats.max;
        case ESPCDFAggregationMethod.Sum:
            return entry.isCumulative
                ? (stats.cumulativeValue ?? stats.sum)
                : stats.sum;
        case ESPCDFAggregationMethod.Latest:
            return stats.lastValue;
        case ESPCDFAggregationMethod.Avg:
        case undefined:
            return stats.average;
        default:
            throw new Error(
                `Aggregation method "${aggregate}" has no window-aggregate projection`,
            );
    }
}

/**
 * Flattens normalized window entries into the CDF response the chart consumes:
 * one `{timestamp, value}` per window, timestamps in Unix **seconds**,
 * ascending. Windows whose projected stat is absent or non-finite (e.g. an
 * empty window) are omitted — the chart renders missing buckets as gaps.
 * `fetchNext` must already be CDF-shaped; adaptors wrap their SDK pagination
 * recursively before passing it in.
 */
export function toCDFAggregatesResponse(
    entries: NormalizedWindowEntry[],
    aggregate: ESPCDFAggregationMethod | undefined,
    hasNext: boolean,
    fetchNext?: () => Promise<ESPCDFSimpleTSDataResponse>,
): ESPCDFSimpleTSDataResponse {
    const tsData: ESPCDFTSData[] = [];
    for (const entry of entries) {
        const value = projectWindowStat(entry, aggregate);
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        tsData.push({ timestamp: entry.windowStartSec, value });
    }
    tsData.sort((a, b) => a.timestamp - b.timestamp);

    const response: ESPCDFSimpleTSDataResponse = { tsData, hasNext };
    if (hasNext && fetchNext) {
        response.fetchNext = fetchNext;
    }
    return response;
}
