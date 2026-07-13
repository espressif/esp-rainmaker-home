/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from "react";
import type {
  ESPCDFDeviceParam,
  ESPCDFSimpleTSDataResponse,
  ESPCDFSimpleTSDataRequest,
  ESPCDFTSData,
  ESPCDFTSDataRequest,
} from "@store";

// Types
import type {
  TimeSeriesPeriod,
  AggregationMethod,
  ChartDataPoint,
  UseTimeSeriesDataResult,
  AggregationIntervalType,
} from "@src/types/global";

// Utils
import {
  buildTimeSeriesRequest,
  formatTimestampForPeriod,
  generateExpectedTimestampsForInterval,
  interpolateData,
  getInterpolationInterval,
} from "@features/control/utils/timeSeriesHelper";
import { canonicalizeIana } from "@shared/utils/timezone";
import {
  ESPRM_PARAM_SIMPLE_TIME_SERIES_PROPERTY,
  TIME_SERIES_PERIOD_1D,
} from "@shared/utils/constants";

/**
 * Custom hook for fetching and managing time series data.
 * Integrates with Chart.tsx component.
 *
 * For standard periods ("1H", "1D", "7D", "4W", "1Y"), the initial (first) fetch request
 * is always relative to the current time (i.e., most recent up to "now").
 * @param param - The device parameter to fetch time series data for
 * @returns Object containing data, loading state, error, fetchData function
 */
export const useTimeSeriesData = (
  param: ESPCDFDeviceParam | null
): UseTimeSeriesDataResult => {
  // State
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // ============================================================================
  // Helper Functions
  // ============================================================================

  /**
   * Recursively fetches all time series data by following fetchNext pagination
   */
  const fetchAllData = async (
    response: ESPCDFSimpleTSDataResponse,
    accumulatedData: ESPCDFTSData[] = []
  ): Promise<ESPCDFTSData[]> => {
    const allData = [...accumulatedData, ...response.tsData];

    if (response.hasNext && response.fetchNext) {
      const nextResponse = await response.fetchNext();
      return fetchAllData(nextResponse, allData);
    }

    return allData;
  };

  // ============================================================================
  // Main Fetch Function
  // ============================================================================

  const fetchData = useCallback(
    async (
      period: TimeSeriesPeriod | null,
      aggregation: AggregationMethod,
      startTime: number,
      endTime: number,
      aggregationInterval?: AggregationIntervalType
    ) => {
      if (!param) {
        setError(new Error("Parameter not available"));
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const isSimpleTimeSeries =
          param.properties?.includes(ESPRM_PARAM_SIMPLE_TIME_SERIES_PROPERTY) ||
          false;

        const request = buildTimeSeriesRequest({
          period,
          aggregation: isSimpleTimeSeries ? undefined : aggregation,
          startTime,
          endTime,
          resultCount: 200,
          descOrder: false,
          isSimpleTimeSeries,
          aggregationInterval: aggregationInterval,
          timezone: canonicalizeIana(Intl.DateTimeFormat().resolvedOptions().timeZone),
        });

        let response: ESPCDFSimpleTSDataResponse | undefined = isSimpleTimeSeries
          ? await param?.getSimpleTSData?.(
            request as ESPCDFSimpleTSDataRequest
          )
          : aggregation === "raw"
            ? await param?.getRawTSData?.(request as ESPCDFTSDataRequest)
            : await param?.getTSData?.(request as ESPCDFTSDataRequest);

        if (!response) {
          setError(new Error("Failed to fetch time series data"));
          setData([]);
          setLoading(false);
          return;
        }

        const allTSData = await fetchAllData(response);

        if (allTSData.length === 0) {
          setData([]);
          setLoading(false);
          return;
        }

        const formatPeriod = period || TIME_SERIES_PERIOD_1D;
        const chartData: ChartDataPoint[] = allTSData.map(
          (point: ESPCDFTSData) => {
            const timestampMs = point.timestamp * 1000;

            return {
              value:
                typeof point.value === "number"
                  ? point.value
                  : parseFloat(String(point.value)),
              label: formatTimestampForPeriod(timestampMs, formatPeriod),
              timestamp: timestampMs,
            };
          }
        );

        let finalData: ChartDataPoint[] = chartData;

        if (startTime !== undefined && endTime !== undefined) {
          const interpolationInterval = getInterpolationInterval(
            aggregation,
            (request as ESPCDFTSDataRequest).aggregationInterval,
            aggregationInterval,
            period
          );

          const expectedTimestamps = generateExpectedTimestampsForInterval(
            startTime,
            endTime,
            interpolationInterval
          );

          finalData = interpolateData(
            chartData,
            expectedTimestamps,
            period,
            endTime,
            interpolationInterval
          );
        }

        setData(finalData);
      } catch (err) {
        console.error("Error fetching time series data:", err);
        setError(err as Error);
        setData([]);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
    [param]
  );

  return {
    data,
    loading,
    error,
    fetchData
  };
};
