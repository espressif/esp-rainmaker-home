/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { View, ScrollView, TouchableOpacity } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Calendar as CalendarIcon } from "lucide-react-native";
import { useTranslation } from "react-i18next";

// Components
import { Header, BadgeText } from "@/components";
import GenericChart from "@/components/Charts/GenericChart";
import TimeNavigator from "@/components/Charts/TimeNavigator";
import ChartHeader from "@/components/Charts/ChartHeader";
import ChartMessage from "@/components/Charts/ChartMessage";
import ChartPeriodSelector from "@/components/Charts/ChartPeriodSelector";
import ChartTypeToggle from "@/components/Charts/ChartTypeToggle";
import DateRangeCalendarBottomSheet from "@/components/Modals/DateRangeCalendarBottomSheet";
import AggregationDropdown from "@/components/Charts/AggregationDropdown";

// Hooks
import { useTimeSeriesData } from "@/hooks/useTimeSeriesData";
import { useCDF } from "@/hooks/useCDF";

// Utils
import {
  getTimeRange,
  formatTimeRangeDisplay,
  formatDateRangeForDisplay,
  calculatePreviousDateRange,
  calculateNextDateRange,
  canNavigateToNext,
  determineIntervalFromDuration,
} from "@/utils/timeSeriesHelper";
import {
  ESPRM_PARAM_SIMPLE_TIME_SERIES_PROPERTY,
  TIME_SERIES_PERIODS,
  TIME_SERIES_AGGREGATIONS,
  TIME_SERIES_PERIOD_1H,
  TIME_SERIES_PERIOD_4W,
  TIME_SERIES_PERIOD_1Y,
  AGGREGATION_RAW,
  AGGREGATION_LATEST,
  CHART_TYPE_LINE,
  WRITE_PERMISSION,
} from "@/utils/constants";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Types
import type {
  TimeSeriesPeriod,
  AggregationMethod,
  GenericChartProps,
  ChartState,
  DateRange,
  DateRangeCalendarBottomSheetRef,
} from "@/types/global";
import { DATE_RANGE_CONSTANTS } from "@/utils/dateRangeHelper";

/**
 * Chart Component
 *
 * A generic time series chart component for visualizing device parameter data.
 * Supports multiple time periods, aggregation methods, and chart types (line/bar).
 *
 * Features:
 * - Time period selection (1H, 1D, 7D, 4W, 1Y)
 * - Aggregation methods (raw, avg, min, max, count, latest)
 * - Chart type toggle (line/bar)
 * - Time navigation (previous/next periods)
 * - Interactive chart with point selection
 * - Scroll lock during chart interactions
 *
 * @component
 * @returns Rendered Chart component
 */
const Chart = () => {
  const { t } = useTranslation();
  const { nodeId, deviceName, paramName } = useLocalSearchParams<{
    nodeId?: string;
    deviceName?: string;
    paramName?: string;
  }>();

  const { store } = useCDF();
  const node = store?.nodeStore?.nodesByID?.[nodeId || ""];
  const device = node?.nodeConfig?.devices.find((d) => d.name === deviceName);
  const param = device?.params?.find((p) => p.name === paramName) || null;
  const paramProperties = param?.properties || [];
  const isWriteableParam = paramProperties.includes(WRITE_PERMISSION);
  const isSimpleTimeSeriesParam = paramProperties.includes(
    ESPRM_PARAM_SIMPLE_TIME_SERIES_PROPERTY
  );

  // Time period and navigation state
  const [selectedPeriod, setSelectedPeriod] = useState<TimeSeriesPeriod | null>(
    TIME_SERIES_PERIOD_1H
  );
  const [timeOffset, setTimeOffset] = useState(0);
  const [customDateRange, setCustomDateRange] = useState<DateRange | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);

  // Chart configuration state
  const [chartType, setChartType] =
    useState<GenericChartProps["type"]>(CHART_TYPE_LINE);
  const [aggregation, setAggregation] =
    useState<AggregationMethod>(AGGREGATION_RAW);

  // UI state
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  const buttonRef = useRef<any>(null);
  const calendarButtonRef = useRef<any>(null);
  const chartContainerRef = useRef<any>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const calendarBottomSheetRef = useRef<DateRangeCalendarBottomSheetRef>(null);

  const periods: TimeSeriesPeriod[] = [...TIME_SERIES_PERIODS];
  const aggregations: AggregationMethod[] = [...TIME_SERIES_AGGREGATIONS];

  const UNSUPPORTED_PERIODS_BY_AGGREGATION: Partial<
    Record<AggregationMethod, readonly TimeSeriesPeriod[]>
  > = {
    [AGGREGATION_RAW]: [TIME_SERIES_PERIOD_1Y],
    [AGGREGATION_LATEST]: [TIME_SERIES_PERIOD_4W, TIME_SERIES_PERIOD_1Y],
  } as const;


  const {
    data: fetchedData,
    loading,
    error,
    fetchData,
  } = useTimeSeriesData(param);

  const isUnsupportedCombination = (
    aggregation: AggregationMethod,
    period: TimeSeriesPeriod | null,
    customDateRange: DateRange | null
  ): boolean => {
    // Skip all duration restrictions for simple time series
    if (isSimpleTimeSeriesParam) {
      return false;
    }

    if (period)
      return !!UNSUPPORTED_PERIODS_BY_AGGREGATION[aggregation]?.includes(period);

    if (customDateRange && aggregation == AGGREGATION_RAW) {
      const duration = customDateRange.end - customDateRange.start;
      return duration > DATE_RANGE_CONSTANTS.RAW_DATA_MAX_INTERVAL;
    }

    return false;
  };

  /**
   * Reset time offset and clear custom range when period changes
   */
  useEffect(() => {
    if (selectedPeriod !== null) {
      setTimeOffset(0);
      setCustomDateRange(null);
    }
  }, [selectedPeriod]);

  /**
   * Clear calendar selection when customDateRange becomes null
   */
  useEffect(() => {
    if (customDateRange === null && calendarBottomSheetRef.current) {
      calendarBottomSheetRef.current.clearSelection();
    }
  }, [customDateRange]);

  /**
   * Fetch data when period, aggregation, timeOffset, or customDateRange changes
   */
  useEffect(() => {
    if (!param) return;
    if (!customDateRange && !selectedPeriod) return;
    if (isUnsupportedCombination(aggregation, selectedPeriod, customDateRange)) return;

    if (customDateRange) {
      fetchData(
        null,
        aggregation,
        customDateRange.start,
        customDateRange.end,
        customDateRange.aggregationInterval
      );
      return;
    }

    if (selectedPeriod) {
      const { startTime, endTime } = getTimeRange(selectedPeriod, timeOffset);
      fetchData(selectedPeriod, aggregation, startTime, endTime);
    }
  }, [
    param,
    aggregation,
    selectedPeriod,
    customDateRange,
    timeOffset,
    fetchData,
  ]);

  // ============================================================================
  // Computed Values
  // ============================================================================

  const isUnsupported = useMemo(
    () => isUnsupportedCombination(aggregation, selectedPeriod, customDateRange),
    [aggregation, selectedPeriod]
  );

  const timeSeriesData = useMemo(() => {
    if (isUnsupported) {
      return [];
    }
    return fetchedData;
  }, [fetchedData, isUnsupported]);

  const chartState: ChartState = useMemo(() => {
    if (loading) return "loading";
    if (error) return "error";
    if (isUnsupported) return "unsupported";
    if (timeSeriesData.length === 0) return "empty";
    return "ready";
  }, [loading, error, isUnsupported, timeSeriesData.length]);

  const CHART_STATE_LABEL_MAP: Record<Exclude<ChartState, "ready">, string> = {
    loading: t("device.chart.loadingChartData"),
    error: t("device.chart.errorLoadingData", {
      message: error?.message,
    }),
    unsupported: t("device.chart.notSupportedForDuration"),
    empty: t("device.chart.noDataAvailable"),
  };

  /**
   * Check if navigation to next period is possible
   */
  const canNavigateNext = useMemo(
    () => canNavigateToNext(customDateRange, timeOffset),
    [customDateRange, timeOffset]
  );
  
  /**
   * Compute the label for the time navigator
   * - Uses custom date range when available
   * - Falls back to selected period + offset
   */
  const getTimeNavigatorLabel = useCallback((): string => {
    if (customDateRange) {
      return formatDateRangeForDisplay(
        customDateRange.start,
        customDateRange.end
      );
    }

    if (selectedPeriod) {
      return formatTimeRangeDisplay(selectedPeriod, timeOffset);
    }

    return "";
  }, [customDateRange, selectedPeriod, timeOffset]);

  /**
   * Handle aggregation method selection
   */
  const handleSelectAggregation = useCallback(
    (agg: string) => {
      const newAggregation = agg as AggregationMethod;
      setAggregation(newAggregation);
      setTooltipVisible(false);

      if (customDateRange) {
        const duration = customDateRange.end - customDateRange.start;
        const interval = determineIntervalFromDuration(duration, newAggregation);
        setCustomDateRange({
          ...customDateRange,
          aggregationInterval: interval,
        });
      }
    },
    [customDateRange]
  );

  /**
   * Handle navigation to previous time period
   */
  const handlePreviousPeriod = useCallback(() => {
    if (customDateRange) {
      setCustomDateRange(calculatePreviousDateRange(customDateRange));
    } else {
      setTimeOffset((prev) => prev + 1);
    }
  }, [customDateRange]);

  /**
   * Handle navigation to next time period
   */
  const handleNextPeriod = useCallback(() => {
    if (customDateRange) {
      const nextRange = calculateNextDateRange(customDateRange);
      if (nextRange) {
        setCustomDateRange(nextRange);
      }
    } else {
      setTimeOffset((prev) => Math.max(0, prev - 1));
    }
  }, [customDateRange]);

  /**
   * Handle calendar date range selection
   */
  const handleDateRangeSelect = useCallback(
    (range: DateRange) => {
      if (!range.aggregationInterval) {
        const duration = range.end - range.start;
        const interval = determineIntervalFromDuration(duration, aggregation);
        range.aggregationInterval = interval;
      }

      setCustomDateRange(range);
      setTimeOffset(0);
      setSelectedPeriod(null);
    },
    [aggregation]
  );

  /**
   * Handle calendar open/close
   */
  const handleCalendarToggle = useCallback(() => {
    setCalendarVisible((prev) => !prev);
  }, []);

  /**
   * Handle period selection
   */
  const handlePeriodSelect = useCallback((period: TimeSeriesPeriod) => {
    setSelectedPeriod(period);
    setCustomDateRange(null);
    setTimeOffset(0);
  }, []);

  return (
    <>
      <Header
        label={t("device.chart.title")}
        showBack={true}
        rightSlot={<View style={globalStyles.headerSpacer} />}
      />
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1 }}
      >
        {/* Chart Header with inline edit (no value shown) */}
        {!loading && isWriteableParam && (
          <ChartHeader
            label={paramName || t("device.chart.value")}
            param={param}
            isWriteable={isWriteableParam}
            disabled={loading}
          />
        )}

        {/* Time Range Navigator with Calendar Button */}
        <View
          style={globalStyles.timeNavigatorContainer}
        >
          <TimeNavigator
            period={selectedPeriod}
            offset={timeOffset}
            loading={loading}
            onPrevious={handlePreviousPeriod}
            onNext={handleNextPeriod}
            canNavigateNext={canNavigateNext}
            label={getTimeNavigatorLabel()}
          />
          {/* Calendar Button */}
          <TouchableOpacity
            ref={calendarButtonRef}
            onPress={handleCalendarToggle}
            disabled={loading}
            style={[
              globalStyles.timeNavigatorButton,
              loading && globalStyles.timeNavigatorButtonDisabled,
            ]}
          >
            <CalendarIcon
              size={tokens.iconSize._20}
              color={tokens.colors.primary}
            />
          </TouchableOpacity>

          {/* Date Range Calendar Bottom Sheet */}
          <DateRangeCalendarBottomSheet
            ref={calendarBottomSheetRef}
            visible={calendarVisible}
            onClose={() => setCalendarVisible(false)}
            onSelect={handleDateRangeSelect}
            range={customDateRange || undefined}
            aggregation={aggregation}
            isSimpleTimeSeries={isSimpleTimeSeriesParam}
          />
        </View>

        {/* Main Chart Section */}
        <View
          style={globalStyles.chartSection}
        >
          {/* Aggregation Dropdown Button - Hidden for simple time series */}
          {!isSimpleTimeSeriesParam && (
            <AggregationDropdown
              aggregation={aggregation}
              aggregations={aggregations}
              loading={loading}
              tooltipVisible={tooltipVisible}
              tooltipPosition={tooltipPosition}
              setTooltipVisible={setTooltipVisible}
              setTooltipPosition={setTooltipPosition}
              buttonRef={buttonRef}
              chartContainerRef={chartContainerRef}
              onSelectAggregation={handleSelectAggregation}
            />
          )}
          {isSimpleTimeSeriesParam && (
            <View style={globalStyles.badgeContainer}>
              <BadgeText>
                {t(`device.chart.simpleTimeSeries`)}
              </BadgeText>
            </View>
          )}

          {/* Chart Display */}
          <View
            ref={chartContainerRef}
            style={globalStyles.chartContainer}
          >
            {/* Chart Content */}
            {chartState === "ready" ? (
              <GenericChart
                key={`genericChart-${selectedPeriod || "custom"}-${aggregation}-${chartType}`}
                data={timeSeriesData}
                height={300}
                startTime={timeSeriesData?.[0]?.timestamp || null}
                endTime={
                  timeSeriesData?.[timeSeriesData.length - 1]?.timestamp || null
                }
                type={chartType}
              />
            ) : (
              <ChartMessage
                text={
                  CHART_STATE_LABEL_MAP[
                    chartState as Exclude<ChartState, "ready">
                  ]
                }
              />
            )}
          </View>

          {/* Chart Controls */}
          <View style={globalStyles.chartHeaderWithMargin}>
            <ChartPeriodSelector
              periods={periods}
              selectedPeriod={selectedPeriod}
              customDateRange={customDateRange}
              loading={loading}
              onSelect={handlePeriodSelect}
            />

            <ChartTypeToggle
              chartType={chartType}
              loading={loading}
              onChange={setChartType}
            />
          </View>
        </View>
      </ScrollView>

    </>
  );
};

export default Chart;
