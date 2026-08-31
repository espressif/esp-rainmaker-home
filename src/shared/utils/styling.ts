/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Dimensions, PixelRatio } from "react-native";
import {
  STYLE_GUIDELINE_BASE_HEIGHT,
  STYLE_GUIDELINE_BASE_WIDTH,
} from "@shared/utils/constants";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const [shortDimension, longDimension] =
  SCREEN_WIDTH < SCREEN_HEIGHT
    ? [SCREEN_WIDTH, SCREEN_HEIGHT]
    : [SCREEN_HEIGHT, SCREEN_WIDTH];

/**
 * Scales a design-px size to the current native screen width.
 * @param size - Design size based on {@link STYLE_GUIDELINE_BASE_WIDTH}
 * @returns Pixel-rounded size for the device width
 */
export const scale = (size: number) =>
  Math.round(
    PixelRatio.roundToNearestPixel(shortDimension / STYLE_GUIDELINE_BASE_WIDTH) *
      size,
  );

/**
 * Scales a design-px size to the current native screen height.
 * @param size - Design size based on {@link STYLE_GUIDELINE_BASE_HEIGHT}
 * @returns Pixel-rounded size for the device height
 */
export const verticalScale = (size: number) =>
  Math.round(
    PixelRatio.roundToNearestPixel(longDimension / STYLE_GUIDELINE_BASE_HEIGHT) *
      size,
  );
