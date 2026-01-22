/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import {
  useFont,
  RoundedRect,
  Text as SkiaText,
  Group,
  type SkFont,
} from "@shopify/react-native-skia";

import {
  TOOLTIP_BOX_RADIUS,
  TOOLTIP_BOX_SPACING,
  TOOLTIP_DATE_FONT_SIZE,
  TOOLTIP_EDGE_MARGIN,
  TOOLTIP_FONT_SIZE,
  TOOLTIP_PADDING,
  TOOLTIP_VERTICAL_OFFSET,
} from "./constants";

// Assets
// @ts-ignore
import inter from "@/assets/fonts/inter-medium.ttf";

// Styles
import { tokens } from "@/theme/tokens";
// Types
import type { ChartValueDisplayToolTipProps } from "@/types/global";
// Utils
import { formatTooltipDateTime, formatTooltipValue } from "@/utils/timeSeriesHelper";

/**
 * chartValueDisplayToolTip Component
 * Displays the value and date in a box aligned with the pressed point
 */
export function ChartValueDisplayToolTip({
  activeValue,
  activeTimestamp,
  xPosition,
  yPosition,
  chartLeft,
  chartRight,
  chartTop,
  chartBottom,
}: ChartValueDisplayToolTipProps) {
  const font = useFont(inter, TOOLTIP_FONT_SIZE);
  const dateFont = useFont(inter, TOOLTIP_DATE_FONT_SIZE);

  /**
 * Helper function to measure text width using font glyphs
 * Reusable to avoid duplicate glyph calculation logic
 */
const measureTextWidth = (
  text: SharedValue<string>,
  font: SkFont | null
) =>
  useDerivedValue(() => {
    if (!font || !text.value) return 0;
    const glyphs = font.getGlyphIDs(text.value);
    const widths = font.getGlyphWidths?.(glyphs) ?? [];
    return widths.reduce((a, b) => a + b, 0);
  });

  // Format value for display using shared helper
  const formattedValue = useDerivedValue(() => {
    return formatTooltipValue(activeValue.value);
  });

  // Format timestamp using shared helper
  const formattedTimestamp = useDerivedValue(() => {
    const timestamp = activeTimestamp.value;
    if (!timestamp || isNaN(timestamp)) {
      return "";
    }
    return formatTooltipDateTime(timestamp);
  });

  // Calculate text widths using helper function
  const valueTextWidth = measureTextWidth(formattedValue, font);
  const dateTextWidth = measureTextWidth(formattedTimestamp, dateFont);

  /**
   * Calculates the width of the tooltip box in pixels.
   * 
   * The box width is determined by the wider of the two text elements (value or date)
   * to ensure both fit comfortably. Additional padding is added on both sides
   * for visual spacing.
   * 
   * Formula: max(valueTextWidth, dateTextWidth) + (padding × 2)
   * 
   * @returns The total width of the tooltip box in pixels
   */
  const boxWidth = useDerivedValue(() => {
    return Math.max(valueTextWidth.value, dateTextWidth.value) + TOOLTIP_PADDING * 2;
  });

  /**
   * Calculates the height of the tooltip box in pixels.
   * 
   * The box height accounts for:
   * - Value text line height (TOOLTIP_FONT_SIZE)
   * - Date text line height (TOOLTIP_DATE_FONT_SIZE)
   * - Spacing between the two text lines (TOOLTIP_BOX_SPACING)
   * - Padding on top and bottom (TOOLTIP_PADDING × 2)
   * 
   * This ensures proper vertical spacing and readability of both text elements.
   * 
   * @returns The total height of the tooltip box in pixels
   */
  const boxHeight = useDerivedValue(() => {
    return (
      TOOLTIP_FONT_SIZE +
      TOOLTIP_DATE_FONT_SIZE +
      TOOLTIP_BOX_SPACING +
      TOOLTIP_PADDING * 2
    );
  });

  /**
   * Calculates the X coordinate (horizontal position) of the tooltip box.
   * 
   * The box is positioned to be centered horizontally on the pressed point's
   * X position. However, it is clamped to ensure the entire tooltip stays
   * within the chart bounds with a safety margin.
   * 
   * Positioning logic:
   * 1. Calculate centered position: xPosition - (boxWidth / 2)
   * 2. Define boundaries: minX = chartLeft + margin, maxX = chartRight - boxWidth - margin
   * 3. Clamp the position to stay within boundaries
   * 
   * This prevents the tooltip from being cut off at chart edges, especially
   * when the user presses near the left or right boundaries.
   * 
   * @returns The X coordinate of the tooltip box, clamped within chart bounds
   */
  const boxX = useDerivedValue(() => {
    // Calculate centered position
    const centeredX = xPosition.value - boxWidth.value / 2;

    // Clamp to stay within chart bounds with margin
    const minX = chartLeft + TOOLTIP_EDGE_MARGIN;
    const maxX = chartRight - boxWidth.value - TOOLTIP_EDGE_MARGIN;

    // Return clamped value
    return Math.max(minX, Math.min(maxX, centeredX));
  });

  /**
   * Calculates the Y coordinate (vertical position) of the tooltip box.
   * 
   * The box is positioned above the pressed point by default, with a vertical
   * offset for visual spacing. If there isn't enough space above the point
   * (e.g., near the top of the chart), it automatically positions below instead.
   * 
   * Positioning logic:
   * 1. Calculate desired position above point: yPosition - boxHeight - offset
   * 2. Check if desired position fits within chart bounds
   * 3. If too high, position below point: yPosition + offset
   * 4. Clamp final position to ensure it stays within chart bounds
   * 
   * This adaptive positioning ensures the tooltip is always visible and
   * doesn't get cut off at the top or bottom of the chart.
   * 
   * @returns The Y coordinate of the tooltip box, positioned above or below
   *          the point based on available space, clamped within chart bounds
   */
  const boxY = useDerivedValue(() => {
    // Position above the y point with offset
    const desiredY =
      yPosition.value - boxHeight.value - TOOLTIP_VERTICAL_OFFSET;

    // Clamp to stay within chart bounds with margin
    const minY = chartTop + TOOLTIP_EDGE_MARGIN;
    const maxY = chartBottom - boxHeight.value - TOOLTIP_EDGE_MARGIN;

    // If desired position is too high, position below the point instead
    if (desiredY < minY) {
      return Math.min(yPosition.value + TOOLTIP_VERTICAL_OFFSET, maxY);
    }

    // Return clamped value
    return Math.max(minY, Math.min(maxY, desiredY));
  });

  /**
   * Calculates the X coordinate for the value text within the tooltip box.
   * 
   * The text is centered horizontally within the box. This provides better
   * visual balance, especially when the box is wider than the text content
   * (e.g., when the date text is longer than the value text).
   * 
   * Formula: boxX + (boxWidth - valueTextWidth) / 2
   * 
   * This centers the value text regardless of which text element (value or date)
   * determines the box width.
   * 
   * @returns The X coordinate for rendering the value text, centered in the box
   */
  const valueTextX = useDerivedValue(() => {
    return boxX.value + (boxWidth.value - valueTextWidth.value) / 2;
  });

  /**
   * Calculates the Y coordinate for the value text within the tooltip box.
   * 
   * The value text is positioned at the top of the box content area, accounting
   * for top padding and the font size. The Y coordinate represents the baseline
   * of the text, which is why we add the font size to the padding.
   * 
   * Formula: boxY + TOOLTIP_PADDING + TOOLTIP_FONT_SIZE
   * 
   * This positions the value text as the first line in the tooltip, with
   * proper spacing from the box edge.
   * 
   * @returns The Y coordinate (baseline) for rendering the value text
   */
  const valueTextY = useDerivedValue(() => {
    return boxY.value + TOOLTIP_PADDING + TOOLTIP_FONT_SIZE;
  });

  /**
   * Calculates the X coordinate for the date text within the tooltip box.
   * 
   * Similar to valueTextX, the date text is centered horizontally within
   * the box for consistent visual alignment. This ensures both text elements
   * are centered even if they have different widths.
   * 
   * Formula: boxX + (boxWidth - dateTextWidth) / 2
   * 
   * @returns The X coordinate for rendering the date text, centered in the box
   */
  const dateTextX = useDerivedValue(() => {
    return boxX.value + (boxWidth.value - dateTextWidth.value) / 2;
  });

  /**
   * Calculates the Y coordinate for the date text within the tooltip box.
   * 
   * The date text is positioned below the value text, with proper spacing
   * between them. The calculation accounts for:
   * - Box top position
   * - Top padding
   * - Value text height (TOOLTIP_FONT_SIZE)
   * - Spacing between text lines (TOOLTIP_BOX_SPACING)
   * - Date text baseline offset (TOOLTIP_DATE_FONT_SIZE)
   * 
   * Formula: boxY + padding + valueFontSize + spacing + dateFontSize
   * 
   * This positions the date text as the second line in the tooltip, with
   * consistent vertical spacing from the value text above it.
   * 
   * @returns The Y coordinate (baseline) for rendering the date text
   */
  const dateTextY = useDerivedValue(() => {
    return (
      boxY.value +
      TOOLTIP_PADDING +
      TOOLTIP_FONT_SIZE +
      TOOLTIP_BOX_SPACING +
      TOOLTIP_DATE_FONT_SIZE
    );
  });

  // Guard rendering when value is invalid (reactive opacity)
  const opacity = useDerivedValue(() => {
    return (
      !!formattedValue.value &&
      !!formattedTimestamp.value &&
      !!font &&
      !!dateFont
    )
      ? 1
      : 0;
  });

  return (
    <Group opacity={opacity}>
      {/* Tooltip Box with border using stroke */}
      {/* Fill layer */}
      <RoundedRect
        x={boxX}
        y={boxY}
        width={boxWidth}
        height={boxHeight}
        r={TOOLTIP_BOX_RADIUS}
        color={tokens.colors.white}
      />
      {/* Border layer using stroke */}
      <RoundedRect
        x={boxX}
        y={boxY}
        width={boxWidth}
        height={boxHeight}
        r={TOOLTIP_BOX_RADIUS}
        color={tokens.colors.gray}
        style="stroke"
        strokeWidth={1}
      />
      {font && (
        <SkiaText
          color={tokens.colors.text_primary}
          font={font}
          text={formattedValue}
          x={valueTextX}
          y={valueTextY}
        />
      )}
      {dateFont && (
        <SkiaText
          color={tokens.colors.text_secondary}
          font={dateFont}
          text={formattedTimestamp}
          x={dateTextX}
          y={dateTextY}
        />
      )}
    </Group>
  );
}

