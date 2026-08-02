/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  RoundedRect,
  Text as SkiaText,
  type SkFont,
} from "@shopify/react-native-skia";
import type { ChartBounds } from "victory-native";

import { tokens } from "@shared/theme/tokens";
import {
  TOOLTIP_BOX_RADIUS,
  TOOLTIP_EDGE_MARGIN,
  TOOLTIP_FONT_SIZE,
  TOOLTIP_LINE_GAP,
  TOOLTIP_PADDING,
  TOOLTIP_VERTICAL_OFFSET,
} from "./constants";

/**
 * Props for the BarValueTooltip Skia overlay.
 */
interface BarValueTooltipProps {
  /** Canvas x of the selected bar's center */
  x: number;
  /** Canvas y of the selected bar's top */
  y: number;
  /** Pre-formatted value label (e.g. "26.1°") */
  label: string;
  /** Pre-formatted period line under the value (e.g. "07-13 Jul") */
  subLabel?: string;
  /** Loaded Skia font for the label */
  font: SkFont;
  /** Chart plotting bounds, used to clamp the tooltip inside the canvas */
  chartBounds: ChartBounds;
}

/**
 * Measures the rendered width of a label in the given font.
 * @param font - Loaded Skia font
 * @param text - Label to measure
 * @returns Total glyph width in pixels
 */
const measureText = (font: SkFont, text: string): number =>
  font
    .getGlyphWidths(font.getGlyphIDs(text))
    .reduce((total, width) => total + width, 0);

/**
 * Value bubble drawn above the selected bar (dark box, light text), with the
 * bucket's period on a second, dimmed line. Clamped to stay within the
 * chart bounds.
 */
const BarValueTooltip: React.FC<BarValueTooltipProps> = ({
  x,
  y,
  label,
  subLabel,
  font,
  chartBounds,
}) => {
  const textWidth = Math.max(
    measureText(font, label),
    subLabel ? measureText(font, subLabel) : 0
  );
  const lineCount = subLabel ? 2 : 1;

  const boxWidth = textWidth + TOOLTIP_PADDING * 2;
  const boxHeight =
    TOOLTIP_FONT_SIZE * lineCount +
    TOOLTIP_LINE_GAP * (lineCount - 1) +
    TOOLTIP_PADDING * 2;

  const minX = chartBounds.left + TOOLTIP_EDGE_MARGIN;
  const maxX = chartBounds.right - boxWidth - TOOLTIP_EDGE_MARGIN;
  const boxX = Math.max(minX, Math.min(maxX, x - boxWidth / 2));

  const desiredY = y - boxHeight - TOOLTIP_VERTICAL_OFFSET;
  const boxY = Math.max(chartBounds.top + TOOLTIP_EDGE_MARGIN, desiredY);

  const valueBaselineY = boxY + TOOLTIP_PADDING + TOOLTIP_FONT_SIZE - 2;

  return (
    <>
      <RoundedRect
        x={boxX}
        y={boxY}
        width={boxWidth}
        height={boxHeight}
        r={TOOLTIP_BOX_RADIUS}
        color={tokens.colors.text_primary}
      />
      <SkiaText
        color={tokens.colors.white}
        font={font}
        text={label}
        x={boxX + TOOLTIP_PADDING}
        y={valueBaselineY}
      />
      {subLabel && (
        <SkiaText
          color={tokens.colors.white}
          opacity={0.7}
          font={font}
          text={subLabel}
          x={boxX + TOOLTIP_PADDING}
          y={valueBaselineY + TOOLTIP_FONT_SIZE + TOOLTIP_LINE_GAP}
        />
      )}
    </>
  );
};

export default BarValueTooltip;
