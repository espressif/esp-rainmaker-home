/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from "react";
import { View } from "react-native";
import {
  useDerivedValue,
} from "react-native-reanimated";
import {
  useFont,
  DashPathEffect,
} from "@shopify/react-native-skia";
import {
  CartesianChart,
  Line,
  useChartTransformState,
  Scatter,
  Bar,
  useChartPressState,
} from "victory-native";

// Assets
// @ts-ignore
import inter from "@/assets/fonts/inter-medium.ttf";

// Utils
import { getDynamicXLabelFormatter,
  calculateBarChartInnerPadding, 
  calculateEvenlySpacedTickValues,
  clamp,
} from "@/utils/timeSeriesHelper";

import {
  CHART_TYPE_BAR,
  CHART_TYPE_LINE,
} from "@/utils/constants";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Types
import type { GenericChartProps, NormalizedChartDataPoint } from "@/types/global";

// Local components
import ActiveValueIndicator from "./ActiveValueIndicator";
import {
  ChartValueDisplayToolTip ,
} from "./ChartValueDisplayToolTip";

/**
 * GenericChart - A versatile chart component for rendering time series data as line charts or bar charts.
 * Features dynamic X-axis label formatting, adaptive styling, and tooltips.
 *
 * @param data - Array of data points with timestamp and value properties
 * @param startTime - Optional start time for chart domain (Unix timestamp in milliseconds)
 * @param endTime - Optional end time for chart domain (Unix timestamp in milliseconds)
 * @param type - Chart type: "line" or "bar" (defaults to "line")
 * @returns Rendered chart component
 */
export default function GenericChart({
  data,
  startTime,
  endTime,
  type = CHART_TYPE_LINE,
}: GenericChartProps) {
  // State
  const [visibleStartTime, setVisibleStartTime] = useState<number | null>(null);
  const [visibleEndTime, setVisibleEndTime] = useState<number | null>(null);
  const { state } = useChartTransformState();

  // Chart press state for tooltip
  const { state: pressState, isActive } = useChartPressState({
    x: 0,
    y: { value: 0 },
  });

  // Indicator color for ActiveValueIndicator
  const indicatorColor = useDerivedValue(() => tokens.colors.primary);

  // Calculate domain bounds from chart data
  const { yMin, yMax, dataStartTime, dataEndTime } = useMemo(() => {
    const yValues = data
      .map((d: any) => d.value)
      .filter((v: number) => v != null);

    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);

    const dataStartTime = startTime;
    const dataEndTime = endTime;

    return {
      yMin,
      yMax,
      dataStartTime,
      dataEndTime,
    };
  }, [data, startTime, endTime]);


  // Initialize visible time range when data bounds change
  useEffect(() => {
    if (dataStartTime !== undefined && dataEndTime !== undefined) {
      setVisibleStartTime(dataStartTime);
      setVisibleEndTime(dataEndTime);
    }
  }, [dataStartTime, dataEndTime]);


  /**
   * Dynamic X-axis label formatter function based on visible time range.
   * Automatically selects appropriate format (time, date, datetime) based on time span.
   *
   * @returns A formatting function that converts Unix timestamps to formatted strings
   */
  const formatXLabel = useMemo(() => {
    const start = visibleStartTime ?? dataStartTime;
    const end = visibleEndTime ?? dataEndTime;
    return getDynamicXLabelFormatter(start, end);
  }, [visibleStartTime, visibleEndTime, dataStartTime, dataEndTime]);

  // Load font for chart labels
  const font = useFont(inter, 12);

  /**
   * Normalized chart data with typed timestamp and value.
   * Transforms input data to ensure consistent typing for chart rendering.
   *
   * @returns Array of normalized data points
   */
  const chartData = useMemo(() => {
    return data.map((item: any) => ({
      timestamp: item.timestamp as number,
      value: item.value as number,
    })) as NormalizedChartDataPoint[];
  }, [data]);

  /**
   * X-axis tick values filtered to visible range.
   * Returns maximum 5 evenly spaced timestamps for axis labels.
   *
   * @returns Array of timestamp values for X-axis ticks
   */
  const tickValues = useMemo(() => {
    return calculateEvenlySpacedTickValues(
      chartData,
      visibleStartTime,
      visibleEndTime,
      dataStartTime,
      dataEndTime
    );
  }, [chartData, visibleStartTime, visibleEndTime, dataStartTime, dataEndTime]);

  /**
   * Chart visual configuration based on visible range.
   * Calculates adaptive styling values for points, lines, and bars.
   *
   * @returns Object containing numVisiblePoints, pointRadius, lineStrokeWidth, barWidth, and innerPadding
   */
  const { pointRadius, lineStrokeWidth, barWidth, innerPadding } = useMemo(() => {
    const visibleStart = visibleStartTime ?? dataStartTime;
    const visibleEnd = visibleEndTime ?? dataEndTime;

    // Count data points within the visible time range
    const numVisiblePoints = chartData.filter((item) => {
      return item.timestamp >= visibleStart && item.timestamp <= visibleEnd;
    }).length || 0 ;

    const pointRadius = 2;
    const lineStrokeWidth = 1;
    const baseBarWidth = numVisiblePoints <= 5 ? 12 : numVisiblePoints <= 20 ? 10 : 8;
    const barWidth = clamp(baseBarWidth, 4, 30);
    const innerPadding = calculateBarChartInnerPadding(numVisiblePoints);

    return {
      numVisiblePoints,
      pointRadius,
      lineStrokeWidth,
      barWidth,
      innerPadding,
    };
  }, [
    chartData,
    visibleStartTime,
    visibleEndTime,
    dataStartTime,
    dataEndTime,
  ]);

  /**
   * CartesianChart configuration object.
   * Contains domain, axis options, and styling configuration for the chart.
   *
   * @returns Configuration object for CartesianChart component
   */
  const cartesianChartConfig = useMemo(
    () => ({
      domainPadding: {
        right: 30,
        left: 10,
        bottom: 10,
        top: 10,
      },
      domain: {
        y: [yMin, yMax],
      },
      axisOptions: {
        font,
        formatXLabel,
      },
      yAxis: [
        {
          font,
          tickCount: 5,
          enableRescaling: false,
          labelPosition: "outset",
          linePathEffect: <DashPathEffect intervals={[4, 4]} />,
        },
      ],
      xAxis: {
        tickCount: 5,
        font,
        formatXLabel,
        tickValues,
        labelPosition: "outset",
        labelOffset: 5,
        linePathEffect: <DashPathEffect intervals={[4, 4]} />
      },
    }),
    [dataStartTime, dataEndTime, yMin, yMax, font, formatXLabel, tickValues],
  );

  return (
    <View style={globalStyles.genericChartContainer}>
      {/* @ts-ignore - Type inference issue with victory-native generics */}
      <CartesianChart
        transformState={state}
        data={chartData}
        xKey="timestamp"
        yKeys={["value"]}
        chartPressState={pressState}
        transformConfig={{
          pan: { enabled: false },
          pinch: { enabled: false },
        }}
        {...cartesianChartConfig}
        renderOutside={({ chartBounds }: any) => (
          <>
            {isActive && (
              <>
                <ActiveValueIndicator
                  xPosition={pressState.x.position}
                  yPosition={pressState.y.value.position}
                  bottom={chartBounds.bottom}
                  top={chartBounds.top}
                  lineColor={tokens.colors.gray}
                  indicatorColor={indicatorColor}
                />
                <ChartValueDisplayToolTip
                  activeValue={pressState.y.value.value}
                  activeTimestamp={pressState.x.value}
                  xPosition={pressState.x.position}
                  yPosition={pressState.y.value.position}
                  chartLeft={chartBounds.left}
                  chartRight={chartBounds.right}
                  chartTop={chartBounds.top}
                  chartBottom={chartBounds.bottom}
                />
              </>
            )}
          </>
        )}
      >
        {({ points, chartBounds }: any) => (
          <>
            {type === CHART_TYPE_BAR ? (
              <Bar
                points={points.value}
                chartBounds={chartBounds}
                barWidth={barWidth}
                innerPadding={innerPadding}
                color={tokens.colors.primary}
              />
            ) : (
              <>
                <Line
                  points={points.value}
                  color={tokens.colors.primary}
                  strokeWidth={lineStrokeWidth}
                  connectMissingData={false}
                />
                <Scatter
                  points={points.value}
                  color={tokens.colors.primary}
                  radius={pointRadius}
                  shape="circle"
                />
              </>
            )}
          </>
        )}
      </CartesianChart>
    </View>
  );
}
