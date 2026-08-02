/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// Bar tooltip constants
export const TOOLTIP_FONT_SIZE = 14;
export const TOOLTIP_PADDING = 8;
export const TOOLTIP_BOX_RADIUS = 6;
export const TOOLTIP_VERTICAL_OFFSET = 10; // Offset above the bar top
export const TOOLTIP_LINE_GAP = 4; // Gap between the value and period lines
export const TOOLTIP_EDGE_MARGIN = 2; // Margin from chart edges

// Bar chart constants
export const CHART_AXIS_FONT_SIZE = 12;
export const CHART_Y_TICK_COUNT = 4;
// Minimum horizontal room per bucket (bar + x label). When the viewport is
// narrower than bucketCount × this, the chart overflows into a horizontal
// scroll instead of squeezing the bars/labels together.
export const CHART_MIN_BUCKET_SLOT_WIDTH = 52;
export const CHART_BAR_INNER_PADDING = 0.6;
export const CHART_BAR_CORNER_RADIUS = 6;
/** Opacity of the base (unselected) bars; the selected bar renders opaque. */
export const CHART_BAR_DIM_OPACITY = 0.55;
/** Extra headroom above the tallest bar so the tooltip fits inside. */
export const CHART_DOMAIN_TOP_PADDING = 44;
export const CHART_BAR_ANIMATION_MS = 300;
