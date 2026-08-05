/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFSimpleTSDataResponse, ESPCDFTSDataRequest } from "@store";
import {
    ESPSimpleTSAggregatesRequest,
    ESPSimpleTSAggregatesResponse,
    ESPSimpleTSAggregateWindow,
} from "@espressif/rainmaker-base-sdk";

import {
    NormalizedWindowEntry,
    epochSecondsToLocalDate,
    mapIntervalToWindow,
    toCDFAggregatesResponse,
} from "../../shared/timeSeries/aggregatesContract";

/**
 * RM-specific half of the time-series aggregates translation: converts
 * between the CDF chart contract and the RM SDK's simple-TS aggregates
 * surface (`getSimpleTSDataAggregates`, gated on the `simple_ts` property).
 * Everything platform-neutral lives in `shared/timeSeries/aggregatesContract`.
 *
 * RM `time_series` params do NOT come through here — they keep the classic
 * `getTSData` pass-through, which honors the request's `timezone`/`weekStart`
 * and is therefore strictly more correct than fixed server windows.
 */

/**
 * Maps a CDF aggregated-TS request onto RM simple-TS aggregates options:
 * interval → window, epoch-seconds range → phone-local `startDate`/`endDate`,
 * `resultCount` passthrough. CDF's `timezone`/`weekStart`/`descOrder` have no
 * wire equivalent on this endpoint and are dropped.
 */
export function toRMAggregatesRequest(
    request: ESPCDFTSDataRequest,
): ESPSimpleTSAggregatesRequest {
    const window = mapIntervalToWindow(
        request.aggregationInterval,
    ) as ESPSimpleTSAggregateWindow;
    const rmRequest: ESPSimpleTSAggregatesRequest = { window };
    if (request.startTime !== undefined && request.endTime !== undefined) {
        rmRequest.startDate = epochSecondsToLocalDate(request.startTime);
        rmRequest.endDate = epochSecondsToLocalDate(request.endTime);
    }
    if (request.resultCount !== undefined) {
        rmRequest.resultCount = request.resultCount;
    }
    return rmRequest;
}

/**
 * Reduces an RM aggregates response to the platform-neutral window entries
 * the shared contract projects from. RM already camelCases the stats and
 * returns `windowStart` as epoch seconds.
 *
 * Semantics note: RM's `cumulativeValue` is the *latest absolute meter
 * reading* (RMNG's is consumption within the window), and RM computes
 * `sum`/`min`/`max`/`average` over consumption deltas for cumulative params.
 * The shared `Sum` projection prefers `cumulativeValue` when present, so RM's
 * `cumulativeValue` is deliberately NOT mapped — the projection falls back to
 * `sum`, which is the correct per-window consumption on RM.
 */
function normalizeRMAggregates(
    response: ESPSimpleTSAggregatesResponse,
): NormalizedWindowEntry[] {
    const normalized: NormalizedWindowEntry[] = [];
    for (const entry of response.aggregates ?? []) {
        if (typeof entry.windowStart !== "number") continue;
        normalized.push({
            windowStartSec: entry.windowStart,
            isCumulative: entry.cumulative,
            stats: {
                count: entry.count,
                sum: entry.sum,
                min: entry.min,
                max: entry.max,
                average: entry.average,
                firstValue: entry.firstValue,
                lastValue: entry.lastValue,
            },
        });
    }
    return normalized;
}

/**
 * Converts an RM aggregates response into the CDF response the chart
 * consumes, projecting the requested aggregate out of each window.
 * Pagination is wrapped recursively so every page comes back CDF-shaped.
 */
export function toCDFResponseFromRMAggregates(
    response: ESPSimpleTSAggregatesResponse,
    request: ESPCDFTSDataRequest,
): ESPCDFSimpleTSDataResponse {
    const hasNext = !!response.hasNext;
    const rmFetchNext = response.fetchNext;
    const fetchNext =
        hasNext && rmFetchNext
            ? async () =>
                  toCDFResponseFromRMAggregates(await rmFetchNext(), request)
            : undefined;
    return toCDFAggregatesResponse(
        normalizeRMAggregates(response),
        request.aggregate,
        hasNext,
        fetchNext,
    );
}
