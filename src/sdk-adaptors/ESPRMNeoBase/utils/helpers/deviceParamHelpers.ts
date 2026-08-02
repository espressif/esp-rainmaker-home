/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPRMNeoTSAggregateEntry,
  ESPRMNeoTSDataOptions,
  ESPRMNeoTSDataResult,
} from "@espressif/rainmaker-neo-base-sdk";
import {
  ESPCDFRawTSDataRequest,
  ESPCDFSimpleTSDataResponse,
  ESPCDFTSData,
  ESPCDFTSDataRequest,
} from "@store";
import {
  AggregationWindow,
  NormalizedWindowEntry,
  epochSecondsToLocalDate,
  mapIntervalToWindow,
  toCDFAggregatesResponse,
} from "../../../shared/timeSeries/aggregatesContract";

/**
 * Neo-specific half of the time-series translation: converts between the CDF
 * chart contract (epoch seconds, `aggregate`+`aggregationInterval`,
 * `{tsData, hasNext, fetchNext}`) and the RMNG SDK's native types (epoch ms,
 * `window`+`YYYY-MM-DD` dates, `{data, aggregates, nextKey}`). Everything
 * platform-neutral lives in `shared/timeSeries/aggregatesContract`.
 */

/**
 * Maps a CDF aggregated-TS request onto RMNG aggregates options: interval →
 * window, epoch-seconds range → phone-local `startDate`/`endDate` (the RMNG
 * aggregates endpoint takes calendar dates, not epochs), `resultCount` →
 * `pageSize`. CDF's `timezone`, `weekStart` and `descOrder` have no RMNG wire
 * equivalent (server windows are Monday-aligned in the device's timezone) and
 * are dropped. Omitting the time range queries the current live window.
 */
export function toNeoAggregateOptions(
    request: ESPCDFTSDataRequest,
): ESPRMNeoTSDataOptions {
    const window: AggregationWindow = mapIntervalToWindow(
        request.aggregationInterval,
    );
    const options: ESPRMNeoTSDataOptions = { window };
    if (request.startTime !== undefined && request.endTime !== undefined) {
        options.startDate = epochSecondsToLocalDate(request.startTime);
        options.endDate = epochSecondsToLocalDate(request.endTime);
    }
    if (request.resultCount !== undefined) {
        options.pageSize = request.resultCount;
    }
    return options;
}

/**
 * Maps a CDF raw-TS request onto RMNG raw options: epoch seconds → epoch ms,
 * `resultCount` → `pageSize`. `startTime` is required by the RMNG SDK
 * (it throws its own validation error when absent).
 */
export function toNeoRawOptions(
    request: ESPCDFRawTSDataRequest,
): ESPRMNeoTSDataOptions {
    const options: ESPRMNeoTSDataOptions = {};
    if (request.startTime !== undefined) {
        options.startTs = request.startTime * 1000;
    }
    if (request.endTime !== undefined) {
        options.endTs = request.endTime * 1000;
    }
    if (request.resultCount !== undefined) {
        options.pageSize = request.resultCount;
    }
    return options;
}

/**
 * Resolves an aggregate entry's window start as Unix seconds. The backend
 * emits RFC3339 `windowStart` strings; epoch numbers are tolerated for
 * safety. Falls back to the entry's `date` (`YYYY-MM-DD`, parsed as
 * phone-local midnight to match the chart's bucketing) when `windowStart`
 * is absent. Returns undefined when neither resolves.
 */
function windowStartSeconds(
    entry: ESPRMNeoTSAggregateEntry,
    window: AggregationWindow,
): number | undefined {
    const windowStart = entry.windows[window]?.windowStart;
    if (typeof windowStart === "number" && Number.isFinite(windowStart)) {
        return windowStart;
    }
    if (typeof windowStart === "string") {
        const parsedMs = Date.parse(windowStart);
        if (!Number.isNaN(parsedMs)) return parsedMs / 1000;
    }
    if (typeof entry.date === "string") {
        const [year, month, day] = entry.date.split("-").map(Number);
        if (year && month && day) {
            return new Date(year, month - 1, day).getTime() / 1000;
        }
    }
    return undefined;
}

/**
 * Reduces the RMNG aggregates result to the platform-neutral window entries
 * the shared contract projects from. Entries without a resolvable window
 * start or without stats for the requested window are skipped.
 */
function normalizeNeoAggregates(
    result: ESPRMNeoTSDataResult,
    window: AggregationWindow,
): NormalizedWindowEntry[] {
    const normalized: NormalizedWindowEntry[] = [];
    for (const entry of result.aggregates ?? []) {
        const stats = entry.windows[window];
        if (!stats) continue;
        const startSec = windowStartSeconds(entry, window);
        if (startSec === undefined) continue;
        normalized.push({
            windowStartSec: startSec,
            isCumulative: entry.isCumulative,
            stats,
        });
    }
    return normalized;
}

/**
 * Converts an RMNG aggregates result into the CDF response the chart
 * consumes, projecting the requested aggregate out of each window.
 * Pagination is wrapped recursively so every page comes back CDF-shaped
 * (the chart follows `fetchNext` itself).
 */
export function toCDFResponseFromNeoAggregates(
    result: ESPRMNeoTSDataResult,
    request: ESPCDFTSDataRequest,
): ESPCDFSimpleTSDataResponse {
    const window = mapIntervalToWindow(request.aggregationInterval);
    const hasNext = !!result.hasNext;
    const neoFetchNext = result.fetchNext;
    const fetchNext =
        hasNext && neoFetchNext
            ? async () =>
                  toCDFResponseFromNeoAggregates(await neoFetchNext(), request)
            : undefined;
    return toCDFAggregatesResponse(
        normalizeNeoAggregates(result, window),
        request.aggregate,
        hasNext,
        fetchNext,
    );
}

/**
 * Converts an RMNG raw result into the CDF response shape: point timestamps
 * ms → seconds, non-scalar values skipped (CDF values are number | string |
 * boolean), pagination wrapped recursively.
 */
export function toCDFResponseFromNeoRaw(
    result: ESPRMNeoTSDataResult,
): ESPCDFSimpleTSDataResponse {
    const tsData: ESPCDFTSData[] = [];
    for (const point of result.data ?? []) {
        const { value } = point;
        if (
            typeof value !== "number" &&
            typeof value !== "string" &&
            typeof value !== "boolean"
        ) {
            continue;
        }
        tsData.push({ timestamp: point.timestamp / 1000, value });
    }

    const hasNext = !!result.hasNext;
    const response: ESPCDFSimpleTSDataResponse = { tsData, hasNext };
    const neoFetchNext = result.fetchNext;
    if (hasNext && neoFetchNext) {
        response.fetchNext = async () =>
            toCDFResponseFromNeoRaw(await neoFetchNext());
    }
    return response;
}
