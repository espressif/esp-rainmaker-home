/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from "react";
import type {
  ESPRMDeviceParam,
  ESPSimpleTSDataResponse,
  ESPSimpleTSDataRequest,
  ESPTSData,
  ESPTSDataRequest,
} from "@espressif/rainmaker-base-sdk";

// Types
import type {
  TimeSeriesPeriod,
  AggregationMethod,
  ChartDataPoint,
  UseTimeSeriesDataResult,
  AggregationIntervalType,
} from "@/types/global";

// Utils
import {
  buildTimeSeriesRequest,
  formatTimestampForPeriod,
  generateExpectedTimestampsForInterval,
  interpolateData,
  getInterpolationInterval,
} from "@/utils/timeSeriesHelper";
import {
  ESPRM_PARAM_SIMPLE_TIME_SERIES_PROPERTY,
  TIME_SERIES_PERIOD_1D,
} from "@/utils/constants";

/**
/**
 * Custom hook for fetching and managing time series data.
 * Integrates with Chart.tsx component.
 *
 * For standard periods ("1H", "1D", "7D", "4W", "1Y"), the initial (first) fetch request
 * is always relative to the current time (i.e., most recent up to "now"). 
 *
 * @param param - The device parameter to fetch time series data for
 * @returns Object containing data, loading state, error, fetchData function
 */
export const useTimeSeriesData = (
  param: ESPRMDeviceParam | null
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
   * @param response - The current response from the API
   * @param period - The time period for label formatting
   * @param accumulatedData - Previously accumulated data points
   * @returns Array of all fetched time series data points
   */
  const fetchAllData = async (
    response: ESPSimpleTSDataResponse,
    accumulatedData: ESPTSData[] = []
  ): Promise<ESPTSData[]> => {
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

  /**
   * Fetches time series data for the specified period and aggregation method
   * Automatically handles pagination and formats timestamps based on the period
   * For simple time series params: only sends startTime and endTime (no aggregation/intervals)
   * @param period - The time period to fetch data for (1H, 1D, 7D, 4W, 1Y) - null when using custom range
   * @param aggregation - The aggregation method to use (raw, avg, min, max, count, latest) - ignored for simple time series
   * @param startTime - Optional start time in milliseconds (required for custom range, defaults to calculated time for period-based)
   * @param endTime - Optional end time in milliseconds (required for custom range, defaults to now for period-based)
   * @param aggregationInterval - Optional dynamic aggregation interval (day, month, year) - required for custom range
   */
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
        // Check if this is a simple time series param
        const isSimpleTimeSeries =
          param.properties?.includes(ESPRM_PARAM_SIMPLE_TIME_SERIES_PROPERTY) ||
          false;

        // Build request payload using helper
        const request = buildTimeSeriesRequest({
          period,
          aggregation: isSimpleTimeSeries ? undefined : aggregation,
          startTime,
          endTime,
          resultCount: 200,
          descOrder: false,
          isSimpleTimeSeries,
          aggregationInterval: aggregationInterval,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });

        // Fetch data based on param type and aggregation method
        const response: ESPSimpleTSDataResponse = isSimpleTimeSeries
          ? await param.getSimpleTSData(request as ESPSimpleTSDataRequest)
          : aggregation === "raw"
          ? await param.getRawTSData(request as ESPTSDataRequest)
          : await param.getTSData(request as ESPTSDataRequest);

        // Recursively fetch all paginated data
        const allTSData = await fetchAllData(response);

        if (allTSData.length === 0) {
          setData([]);
          setLoading(false);
          return;
        }

        // Transform response to chart data format
        // For custom range (period is null), use a default period for formatting
        const formatPeriod = period || TIME_SERIES_PERIOD_1D;
        const chartData: ChartDataPoint[] = allTSData.map(
          (point: ESPTSData) => {
            // API returns timestamp in seconds, convert to milliseconds for JS Date
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

        // Interpolate data to fill missing values in the expected time range
        let finalData: ChartDataPoint[] = chartData;

        if (startTime !== undefined && endTime !== undefined) {
          // Determine interpolation interval using helper function
          const interpolationInterval = getInterpolationInterval(
            aggregation,
            (request as ESPTSDataRequest).aggregationInterval,
            aggregationInterval,
            period
          );

          // Generate expected timestamps and interpolate data
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
    [param]
  );

  return {
    data,
    loading,
    error,
    fetchData
  };
};
