/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { ScrollView } from "react-native";
import { useTranslation } from "react-i18next";

import { useTimeSeriesData } from "./useTimeSeriesData";
import { useCDF } from "@shared/hooks/useCDF";
import {
  getTimeRange,
  formatTimeRangeDisplay,
  formatDateRangeForDisplay,
  calculatePreviousDateRange,
  calculateNextDateRange,
  canNavigateToNext,
  determineIntervalFromDuration,
} from "@features/control/utils/timeSeriesHelper";
import {
  TIME_SERIES_PERIOD_1H,
  TIME_SERIES_PERIODS,
  TIME_SERIES_AGGREGATIONS,
  AGGREGATION_RAW,
  CHART_TYPE_LINE,
  ESPRM_PARAM_SIMPLE_TIME_SERIES_PROPERTY,
  WRITE_PERMISSION,
} from "@shared/utils/constants";
import { isUnsupportedCombination } from "@features/control/utils/chartHelper";
import type {
  TimeSeriesPeriod,
  AggregationMethod,
  GenericChartProps,
  ChartState,
  DateRange,
  DateRangeCalendarBottomSheetRef,
} from "@src/types/global";

interface UseChartParams {
  nodeId?: string;
  deviceName?: string;
  paramName?: string;
}

interface UseChartReturn {
  // Data
  param: any;
  isWriteableParam: boolean;
  isSimpleTimeSeriesParam: boolean;
  timeSeriesData: any[];
  chartState: ChartState;
  chartStateLabelMap: Record<Exclude<ChartState, "ready">, string>;

  // State
  selectedPeriod: TimeSeriesPeriod | null;
  timeOffset: number;
  customDateRange: DateRange | null;
  calendarVisible: boolean;
  chartType: GenericChartProps["type"];
  aggregation: AggregationMethod;
  tooltipVisible: boolean;
  tooltipPosition: { x: number; y: number };
  loading: boolean;
  error: Error | null;

  // Setters
  setCalendarVisible: (visible: boolean) => void;

  // Computed
  isUnsupported: boolean;
  canNavigateNext: boolean;
  timeNavigatorLabel: string;
  periods: TimeSeriesPeriod[];
  aggregations: AggregationMethod[];

  // Refs
  buttonRef: React.RefObject<any>;
  calendarButtonRef: React.RefObject<any>;
  chartContainerRef: React.RefObject<any>;
  scrollViewRef: React.RefObject<ScrollView | null>;
  calendarBottomSheetRef: React.RefObject<DateRangeCalendarBottomSheetRef | null>;

  // Handlers
  handleSelectAggregation: (agg: string) => void;
  handlePreviousPeriod: () => void;
  handleNextPeriod: () => void;
  handleDateRangeSelect: (range: DateRange) => void;
  handleCalendarToggle: () => void;
  handlePeriodSelect: (period: TimeSeriesPeriod) => void;
  setChartType: (type: GenericChartProps["type"]) => void;
  setTooltipVisible: (visible: boolean) => void;
  setTooltipPosition: (position: { x: number; y: number }) => void;
}

/**
 * Custom hook for Chart component business logic
 */
export const useChart = ({ nodeId, deviceName, paramName }: UseChartParams): UseChartReturn => {
  const { t } = useTranslation();
  const { store } = useCDF();

  const node = store?.nodeStore?.nodesByIDMap?.[nodeId || ""];
  const device = node?.devices?.find((d) => d.name === deviceName);
  const param = device?.params?.find((p) => p.name === paramName) || null;
  const paramProperties = param?.properties || [];
  const isWriteableParam = paramProperties.includes(WRITE_PERMISSION);
  const isSimpleTimeSeriesParam = paramProperties.includes(
    ESPRM_PARAM_SIMPLE_TIME_SERIES_PROPERTY
  );

  const [selectedPeriod, setSelectedPeriod] = useState<TimeSeriesPeriod | null>(
    TIME_SERIES_PERIOD_1H
  );
  const [timeOffset, setTimeOffset] = useState(0);
  const [customDateRange, setCustomDateRange] = useState<DateRange | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);

  const [chartType, setChartType] =
    useState<GenericChartProps["type"]>(CHART_TYPE_LINE);
  const [aggregation, setAggregation] =
    useState<AggregationMethod>(AGGREGATION_RAW);

  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  const buttonRef = useRef<any>(null);
  const calendarButtonRef = useRef<any>(null);
  const chartContainerRef = useRef<any>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const calendarBottomSheetRef = useRef<DateRangeCalendarBottomSheetRef>(null);

  const periods: TimeSeriesPeriod[] = [...TIME_SERIES_PERIODS];
  const aggregations: AggregationMethod[] = [...TIME_SERIES_AGGREGATIONS];

  const {
    data: fetchedData,
    loading,
    error,
    fetchData,
  } = useTimeSeriesData(param);

  useEffect(() => {
    if (selectedPeriod !== null) {
      setTimeOffset(0);
      setCustomDateRange(null);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    if (customDateRange === null && calendarBottomSheetRef.current) {
      calendarBottomSheetRef.current.clearSelection();
    }
  }, [customDateRange]);

  useEffect(() => {
    if (!param) return;
    if (!customDateRange && !selectedPeriod) return;
    if (isUnsupportedCombination(aggregation, selectedPeriod, customDateRange, isSimpleTimeSeriesParam)) return;

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
    isSimpleTimeSeriesParam,
  ]);

  const isUnsupported = useMemo(
    () => isUnsupportedCombination(aggregation, selectedPeriod, customDateRange, isSimpleTimeSeriesParam),
    [aggregation, selectedPeriod, customDateRange, isSimpleTimeSeriesParam]
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

  const chartStateLabelMap: Record<Exclude<ChartState, "ready">, string> = {
    loading: t("device.chart.loadingChartData"),
    error: t("device.chart.errorLoadingData", {
      message: error?.message,
    }),
    unsupported: t("device.chart.notSupportedForDuration"),
    empty: t("device.chart.noDataAvailable"),
  };

  const canNavigateNext = useMemo(
    () => canNavigateToNext(customDateRange, timeOffset),
    [customDateRange, timeOffset]
  );

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

  const handlePreviousPeriod = useCallback(() => {
    if (customDateRange) {
      setCustomDateRange(calculatePreviousDateRange(customDateRange));
    } else {
      setTimeOffset((prev) => prev + 1);
    }
  }, [customDateRange]);

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

  const handleCalendarToggle = useCallback(() => {
    setCalendarVisible((prev) => !prev);
  }, []);

  const handlePeriodSelect = useCallback((period: TimeSeriesPeriod) => {
    setSelectedPeriod(period);
    setCustomDateRange(null);
    setTimeOffset(0);
  }, []);

  return {
    param,
    isWriteableParam,
    isSimpleTimeSeriesParam,
    timeSeriesData,
    chartState,
    chartStateLabelMap,

    selectedPeriod,
    timeOffset,
    customDateRange,
    calendarVisible,
    chartType,
    aggregation,
    tooltipVisible,
    tooltipPosition,
    loading,
    error,

    setCalendarVisible: handleCalendarToggle,

    isUnsupported,
    canNavigateNext,
    timeNavigatorLabel: getTimeNavigatorLabel(),
    periods,
    aggregations,

    buttonRef,
    calendarButtonRef,
    chartContainerRef,
    scrollViewRef,
    calendarBottomSheetRef,

    handleSelectAggregation,
    handlePreviousPeriod,
    handleNextPeriod,
    handleDateRangeSelect,
    handleCalendarToggle,
    handlePeriodSelect,
    setChartType,
    setTooltipVisible,
    setTooltipPosition,
  };
};
