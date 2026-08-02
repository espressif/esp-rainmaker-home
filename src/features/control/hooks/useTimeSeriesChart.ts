/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { ESPCDFAggregationInterval, ESPCDFWeekStart } from "@store";
import type {
  ESPCDFDeviceParam,
  ESPCDFSimpleTSDataRequest,
  ESPCDFSimpleTSDataResponse,
  ESPCDFTSDataRequest,
} from "@store";

import type {
  ChartGranularity,
  ChartState,
  TimeSeriesBucket,
  UseTimeSeriesChartResult,
} from "@src/types/global";
import { useCDF } from "@shared/hooks/useCDF";
import { canonicalizeIana } from "@shared/utils/timezone";
import {
  ESPRM_PARAM_SIMPLE_TIME_SERIES_PROPERTY,
  ESPRM_PARAM_TIME_SERIES_PROPERTY,
} from "@shared/utils/constants";
import {
  CHART_GRANULARITY_DAILY,
  CHART_GRANULARITY_MONTHLY,
  CHART_GRANULARITY_WEEKLY,
  CHART_STATE_EMPTY,
  CHART_STATE_ERROR,
  CHART_STATE_LOADING,
  CHART_STATE_READY,
  CHART_STATE_UNSUPPORTED,
  CHART_WINDOW_BUCKET_COUNT,
  TS_MAX_PAGE_FETCHES,
  TS_PAGE_RESULT_COUNT,
} from "@features/control/constants";
import { computeWindowBuckets } from "@features/control/utils/timeSeriesWindows";
import {
  mapAggregatedPointsToBuckets,
  reducePointsIntoBuckets,
  resolveAggregation,
  summarizeBuckets,
  type TimeSeriesPoint,
} from "@features/control/utils/timeSeriesBuckets";
import {
  formatWindowRangeLabel,
  getParamUnit,
} from "@features/control/utils/timeSeriesFormat";

/**
 * Server aggregation interval used for each granularity tab.
 */
const GRANULARITY_TO_INTERVAL: Record<
  ChartGranularity,
  ESPCDFAggregationInterval
> = {
  [CHART_GRANULARITY_DAILY]: ESPCDFAggregationInterval.Day,
  [CHART_GRANULARITY_WEEKLY]: ESPCDFAggregationInterval.Week,
  [CHART_GRANULARITY_MONTHLY]: ESPCDFAggregationInterval.Month,
};

/**
 * X-axis label density per granularity, per the revamp design
 * (time-series-revamp-ui/): daily and monthly label every bucket; weekly
 * labels every other bucket because its range labels ("07-13 Jun") are too
 * wide for all seven. The tooltip always shows the selected bucket's full
 * label, so thinned buckets stay identifiable.
 */
const GRANULARITY_TO_LABEL_EVERY_NTH: Record<ChartGranularity, number> = {
  [CHART_GRANULARITY_DAILY]: 1,
  [CHART_GRANULARITY_WEEKLY]: 2,
  [CHART_GRANULARITY_MONTHLY]: 1,
};

/**
 * i18n keys for the "Last N …" range label of the newest window.
 */
const GRANULARITY_TO_LAST_WINDOW_KEY: Record<ChartGranularity, string> = {
  [CHART_GRANULARITY_DAILY]: "device.chart.lastWindow.daily",
  [CHART_GRANULARITY_WEEKLY]: "device.chart.lastWindow.weekly",
  [CHART_GRANULARITY_MONTHLY]: "device.chart.lastWindow.monthly",
};

/**
 * Navigation identifiers of the param whose data the chart shows.
 */
interface UseTimeSeriesChartParams {
  nodeId?: string;
  deviceName?: string;
  paramName?: string;
}

/**
 * Collects every raw point of a paginated simple_ts response, following
 * `fetchNext` up to {@link TS_MAX_PAGE_FETCHES} pages as a memory guard.
 * @param firstPage - The first response page
 * @returns All numeric points, timestamps converted to milliseconds
 */
const collectSimpleTSPoints = async (
  firstPage: ESPCDFSimpleTSDataResponse
): Promise<TimeSeriesPoint[]> => {
  const points: TimeSeriesPoint[] = [];
  let page: ESPCDFSimpleTSDataResponse | undefined = firstPage;
  let fetches = 1;

  while (page) {
    for (const item of page.tsData) {
      const value = Number(item.value);
      if (Number.isFinite(value)) {
        points.push({ timestampMs: item.timestamp * 1000, value });
      }
    }
    if (page.hasNext && page.fetchNext && fetches < TS_MAX_PAGE_FETCHES) {
      page = await page.fetchNext();
      fetches += 1;
    } else {
      page = undefined;
    }
  }
  return points;
};

/**
 * Drives the revamped time-series chart screen: resolves the device param
 * from the store, owns the granularity tab / window paging / bar selection
 * state, fetches one window of data per change, and reduces both param
 * variants (`time_series` server aggregation, `simple_ts` client-side
 * bucketing) into the same bucket model consumed by the presentation layer.
 * @param params - Navigation identifiers (`nodeId`, `deviceName`, `paramName`)
 * @returns Everything the Chart screen renders (see UseTimeSeriesChartResult)
 */
export const useTimeSeriesChart = ({
  nodeId,
  deviceName,
  paramName,
}: UseTimeSeriesChartParams): UseTimeSeriesChartResult => {
  const { t } = useTranslation();
  const { store } = useCDF();

  const node = store?.nodeStore?.nodesByIDMap?.[nodeId || ""];
  const device = node?.devices?.find((d) => d.name === deviceName);
  const param: ESPCDFDeviceParam | null =
    device?.params?.find((p) => p.name === paramName) || null;

  const [granularity, setGranularity] = useState<ChartGranularity>(
    CHART_GRANULARITY_DAILY
  );
  const [windowOffset, setWindowOffset] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [buckets, setBuckets] = useState<TimeSeriesBucket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const aggregation = resolveAggregation(param?.dataType, param?.type);

  const supportsServerAggregation =
    (param?.properties?.includes(ESPRM_PARAM_TIME_SERIES_PROPERTY) ?? false) &&
    typeof param?.getTSData === "function";
  const supportsSimpleTS =
    (param?.properties?.includes(ESPRM_PARAM_SIMPLE_TIME_SERIES_PROPERTY) ??
      false) &&
    typeof param?.getSimpleTSData === "function";
  const isSupported = supportsServerAggregation || supportsSimpleTS;

  const boundaries = useMemo(
    () => computeWindowBuckets(granularity, windowOffset, Date.now()),
    [granularity, windowOffset]
  );

  useEffect(() => {
    if (!param || !isSupported) {
      return;
    }
    let cancelled = false;

    /**
     * Fetches the visible window and reduces it into buckets, preferring
     * server-side aggregation when the param supports it.
     */
    const fetchWindow = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const windowStartSec = Math.floor(boundaries[0].start / 1000);
        const windowEndMs = Math.min(
          boundaries[boundaries.length - 1].end,
          Date.now()
        );
        const windowEndSec = Math.floor(windowEndMs / 1000);

        let nextBuckets: TimeSeriesBucket[];
        if (supportsServerAggregation && param.getTSData) {
          const request: ESPCDFTSDataRequest = {
            startTime: windowStartSec,
            endTime: windowEndSec,
            aggregate: aggregation,
            aggregationInterval: GRANULARITY_TO_INTERVAL[granularity],
            descOrder: false,
            timezone: canonicalizeIana(
              Intl.DateTimeFormat().resolvedOptions().timeZone
            ),
          };
          if (request.aggregationInterval === ESPCDFAggregationInterval.Week) {
            request.weekStart = ESPCDFWeekStart.Monday;
          }
          const response = await param.getTSData(request);
          const points = await collectSimpleTSPoints(response);
          nextBuckets = mapAggregatedPointsToBuckets(points, boundaries);
        } else {
          const request: ESPCDFSimpleTSDataRequest = {
            startTime: windowStartSec,
            endTime: windowEndSec,
            resultCount: TS_PAGE_RESULT_COUNT,
          };
          const response = await param.getSimpleTSData!(request);
          const points = await collectSimpleTSPoints(response);
          nextBuckets = reducePointsIntoBuckets(points, boundaries, aggregation);
        }

        if (!cancelled) {
          setBuckets(nextBuckets);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setBuckets([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchWindow();
    return () => {
      cancelled = true;
    };
    // boundaries derives from granularity/windowOffset (already listed);
    // aggregation/support flags derive from param.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [param, granularity, windowOffset]);

  const summary = useMemo(
    () => summarizeBuckets(buckets, aggregation),
    [buckets, aggregation]
  );

  const hasData = useMemo(
    () => buckets.some((bucket) => bucket.value !== null),
    [buckets]
  );

  const chartState: ChartState = useMemo(() => {
    if (!isSupported) return CHART_STATE_UNSUPPORTED;
    if (loading) return CHART_STATE_LOADING;
    if (error) return CHART_STATE_ERROR;
    if (!hasData) return CHART_STATE_EMPTY;
    return CHART_STATE_READY;
  }, [isSupported, loading, error, hasData]);

  const chartStateLabelMap: Record<Exclude<ChartState, "ready">, string> = {
    loading: t("device.chart.loadingChartData"),
    error: t("device.chart.errorLoadingData", { message: error?.message }),
    unsupported: t("device.chart.notSupported"),
    empty: t("device.chart.noDataAvailable"),
  };

  const rangeLabel = useMemo(() => {
    if (windowOffset === 0) {
      return t(GRANULARITY_TO_LAST_WINDOW_KEY[granularity], {
        count: CHART_WINDOW_BUCKET_COUNT,
      });
    }
    return formatWindowRangeLabel(
      boundaries[0].start,
      boundaries[boundaries.length - 1].end,
      t("device.chart.rangeSeparator")
    );
  }, [windowOffset, granularity, boundaries, t]);

  const onSelectGranularity = useCallback((next: ChartGranularity) => {
    setGranularity(next);
    setWindowOffset(0);
    setSelectedIndex(null);
  }, []);

  const onPreviousWindow = useCallback(() => {
    setWindowOffset((offset) => offset + 1);
    setSelectedIndex(null);
  }, []);

  const onNextWindow = useCallback(() => {
    setWindowOffset((offset) => Math.max(0, offset - 1));
    setSelectedIndex(null);
  }, []);

  const onSelectBar = useCallback((index: number) => {
    setSelectedIndex((current) => (current === index ? null : index));
  }, []);

  return {
    title: paramName || t("device.chart.title"),
    granularity,
    buckets,
    summary,
    unit: getParamUnit(param?.type),
    rangeLabel,
    chartState,
    chartStateLabelMap,
    loading,
    canGoNext: windowOffset > 0,
    selectedIndex,
    labelEveryNth: GRANULARITY_TO_LABEL_EVERY_NTH[granularity],
    onSelectGranularity,
    onPreviousWindow,
    onNextWindow,
    onSelectBar,
  };
};
