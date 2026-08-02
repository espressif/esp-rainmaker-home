/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { Gesture, ScrollView } from "react-native-gesture-handler";
import { runOnJS, useAnimatedReaction } from "react-native-reanimated";
import { useFont } from "@shopify/react-native-skia";
import {
  Bar,
  CartesianChart,
  useChartPressState,
  type CartesianActionsHandle,
} from "victory-native";

import inter from "@assets/fonts/inter-medium.ttf";

import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import type { TimeSeriesBarChartProps } from "@src/types/global";
import { formatChartValue } from "@features/control/utils/timeSeriesFormat";
import BarValueTooltip from "./BarValueTooltip";
import {
  CHART_AXIS_FONT_SIZE,
  CHART_BAR_ANIMATION_MS,
  CHART_BAR_CORNER_RADIUS,
  CHART_BAR_DIM_OPACITY,
  CHART_BAR_INNER_PADDING,
  CHART_DOMAIN_TOP_PADDING,
  CHART_MIN_BUCKET_SLOT_WIDTH,
  CHART_Y_TICK_COUNT,
  TOOLTIP_FONT_SIZE,
} from "./constants";

/**
 * One chart datum: the bucket index on x and its (null-coalesced) value on y.
 */
interface BarDatum {
  index: number;
  value: number;
  [key: string]: unknown;
}

/**
 * Bar chart of one time-series window, per the revamp design: rounded bars,
 * horizontal gridlines with the value axis on the right, and tap-to-select
 * bars — the selected bar renders opaque with a value bubble above it.
 */
const TimeSeriesBarChart: React.FC<TimeSeriesBarChartProps> = ({
  buckets,
  unit,
  selectedIndex,
  onSelectBar,
  labelEveryNth = 1,
}) => {
  const axisFont = useFont(inter, CHART_AXIS_FONT_SIZE);
  const tooltipFont = useFont(inter, TOOLTIP_FONT_SIZE);
  const { state: pressState, isActive } = useChartPressState({
    x: 0,
    y: { value: 0 },
  });

  const chartData: BarDatum[] = useMemo(
    () =>
      buckets.map((bucket, index) => ({
        index,
        value: bucket.value ?? 0,
      })),
    [buckets],
  );

  const yMax = useMemo(() => {
    const maxValue = Math.max(...chartData.map((datum) => datum.value), 0);
    return maxValue > 0 ? maxValue : 1;
  }, [chartData]);

  const xTickValues = useMemo(
    () => chartData.map((datum) => datum.index),
    [chartData],
  );

  /**
   * Formats an x tick as its bucket label, thinned by `labelEveryNth`.
   * @param index - The x tick value (bucket index)
   * @returns Bucket label or an empty string for thinned ticks
   */
  const formatXLabel = useCallback(
    (index: number) =>
      index % labelEveryNth === 0 ? (buckets[index]?.label ?? "") : "",
    [buckets, labelEveryNth],
  );

  /**
   * Maps a pressed x value to a bucket index and reports the selection.
   * @param xValue - The x value snapped to the nearest datum by the chart
   */
  const handleBarPress = useCallback(
    (xValue: number) => {
      const index = Math.min(
        buckets.length - 1,
        Math.max(0, Math.round(xValue)),
      );
      onSelectBar(index);
    },
    [buckets.length, onSelectBar],
  );

  // Reports the pressed bucket to React state exactly once per snapped value.
  useAnimatedReaction(
    () => (isActive ? pressState.x.value.value : null),
    (current, previous) => {
      if (current !== null && current !== previous) {
        runOnJS(handleBarPress)(current);
      }
    },
    [isActive, handleBarPress],
  );

  const actionsRef = useRef<CartesianActionsHandle<typeof pressState>>(null);

  /**
   * Quick taps: the chart's built-in press gesture is a pan that only
   * activates after a ~100ms hold (so it loses the race against the screen's
   * ScrollView), which makes a brisk tap register nothing. A dedicated Tap
   * gesture resolves the tapped coordinate to the nearest bar through the
   * chart's own scale (`actionsRef.handleTouch`) and selects it immediately.
   * Press-and-drag scrubbing still works through the built-in pan gesture.
   */
  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .onStart((event) => {
          const actions = actionsRef.current;
          if (!actions) return;
          actions.handleTouch(pressState, event.x, event.y);
          handleBarPress(pressState.x.value.value);
        }),
    [pressState, handleBarPress],
  );

  const selectedBucket =
    selectedIndex !== null ? (buckets[selectedIndex] ?? null) : null;
  const tooltipLabel =
    selectedBucket && selectedBucket.value !== null
      ? formatChartValue(selectedBucket.value, unit, "")
      : null;

  // Horizontal overflow: when the viewport can't give every bucket its
  // minimum slot width, the chart keeps that width and scrolls horizontally
  // (opening at the newest, right-hand end) instead of squeezing bars and
  // x labels together. The viewport is measured on the ScrollView itself —
  // measuring the padded container instead would oversize the chart by the
  // padding and clip the right-side y-axis labels.
  const [viewportWidth, setViewportWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const handleViewportLayout = useCallback((event: LayoutChangeEvent) => {
    setViewportWidth(event.nativeEvent.layout.width);
  }, []);
  const contentWidth = Math.max(
    viewportWidth,
    buckets.length * CHART_MIN_BUCKET_SLOT_WIDTH,
  );
  const isOverflowing = viewportWidth > 0 && contentWidth > viewportWidth;
  const handleContentSizeChange = useCallback(() => {
    if (isOverflowing) {
      scrollRef.current?.scrollToEnd({ animated: false });
    }
  }, [isOverflowing]);

  return (
    <View style={globalStyles.chartContainer}>
      <ScrollView
        ref={scrollRef}
        horizontal
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEnabled={isOverflowing}
        onLayout={handleViewportLayout}
        onContentSizeChange={handleContentSizeChange}
      >
        {viewportWidth > 0 && (
          <View style={{ width: contentWidth, height: "100%" }}>
            <CartesianChart
              data={chartData}
              xKey="index"
              yKeys={["value"]}
              chartPressState={pressState}
              actionsRef={actionsRef}
              customGestures={Gesture.Race(tapGesture)}
              domain={{ y: [0, yMax] }}
              domainPadding={{ top: CHART_DOMAIN_TOP_PADDING }}
              xAxis={{
                font: axisFont,
                tickValues: xTickValues,
                formatXLabel,
                lineWidth: 0,
                labelColor: tokens.colors.text_secondary,
              }}
              yAxis={[
                {
                  font: axisFont,
                  axisSide: "right",
                  tickCount: CHART_Y_TICK_COUNT,
                  lineColor: tokens.colors.borderColor,
                  labelColor: tokens.colors.text_secondary,
                },
              ]}
            >
              {({ points, chartBounds }) => {
                const selectedPoint =
                  selectedIndex !== null
                    ? points.value[selectedIndex]
                    : undefined;
                return (
                  <>
                    <Bar
                      points={points.value}
                      chartBounds={chartBounds}
                      color={tokens.colors.primary}
                      opacity={CHART_BAR_DIM_OPACITY}
                      innerPadding={CHART_BAR_INNER_PADDING}
                      roundedCorners={{
                        topLeft: CHART_BAR_CORNER_RADIUS,
                        topRight: CHART_BAR_CORNER_RADIUS,
                      }}
                      animate={{
                        type: "timing",
                        duration: CHART_BAR_ANIMATION_MS,
                      }}
                    />
                    {selectedPoint && (
                      <Bar
                        points={[selectedPoint]}
                        chartBounds={chartBounds}
                        barCount={points.value.length}
                        color={tokens.colors.primary}
                        innerPadding={CHART_BAR_INNER_PADDING}
                        roundedCorners={{
                          topLeft: CHART_BAR_CORNER_RADIUS,
                          topRight: CHART_BAR_CORNER_RADIUS,
                        }}
                      />
                    )}
                    {selectedPoint &&
                      typeof selectedPoint.y === "number" &&
                      tooltipLabel &&
                      tooltipFont && (
                        <BarValueTooltip
                          x={selectedPoint.x}
                          y={selectedPoint.y}
                          label={tooltipLabel}
                          subLabel={selectedBucket?.label}
                          font={tooltipFont}
                          chartBounds={chartBounds}
                        />
                      )}
                  </>
                );
              }}
            </CartesianChart>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default TimeSeriesBarChart;
