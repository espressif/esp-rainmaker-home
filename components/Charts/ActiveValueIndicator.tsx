/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { ActiveValueIndicatorProps } from "@/types/global";
import {
  ACTIVE_VALUE_INDICATOR_OUTER_COLOR,
  ACTIVE_VALUE_INDICATOR_OUTER_RADIUS,
} from "./constants";
import { useDerivedValue } from "react-native-reanimated";
import {
  Circle,
  Line as SkiaLine,
  vec,
} from "@shopify/react-native-skia";

/**
 * ActiveValueIndicator Component
 * 
 * Renders a visual indicator for the active/selected value on a chart.
 * Displays a vertical line spanning the chart height and a circular indicator
 * at the data point position. Used to show the value at a specific x-position
 * when the user interacts with the chart (e.g., dragging or hovering).
 */
const ActiveValueIndicator: React.FC<ActiveValueIndicatorProps> = ({
  xPosition,      // X-coordinate position of the indicator (animated)
  yPosition,      // Y-coordinate position of the data point (animated)
  top,            // Top boundary of the chart area
  bottom,         // Bottom boundary of the chart area
  lineColor,      // Color of the vertical line
  indicatorColor, // Color of the inner indicator circle
}) => {
  // Calculate the start and end points of the vertical line
  // The line spans from bottom to top at the current x-position
  const start = useDerivedValue(() => vec(xPosition.value, bottom));
  const end = useDerivedValue(() => vec(xPosition.value, top));

  return (
    <>
      {/* Vertical line that spans the full height of the chart */}
      <SkiaLine p1={start} p2={end} color={lineColor} strokeWidth={1} />
      
      {/* Inner circle indicator at the data point position */}
      <Circle cx={xPosition} cy={yPosition} r={3} color={indicatorColor} />
      
      {/* Outer circle for visual emphasis/halo effect */}
      <Circle
        cx={xPosition}
        cy={yPosition}
        r={ACTIVE_VALUE_INDICATOR_OUTER_RADIUS}
        color={ACTIVE_VALUE_INDICATOR_OUTER_COLOR}
      />
    </>
  );
};

export default ActiveValueIndicator;

