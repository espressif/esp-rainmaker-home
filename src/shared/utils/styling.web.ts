/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Dimensions, PixelRatio } from "react-native";
import {
  STYLE_GUIDELINE_BASE_HEIGHT,
  STYLE_GUIDELINE_BASE_WIDTH,
  WEB_EMBED_PHONE_HEIGHT,
  WEB_EMBED_PHONE_WIDTH,
} from "@shared/utils/constants";

/**
 * Reads the current window dimensions and returns the short/long axis capped
 * at the phone-glass size. Called on each `scale` / `verticalScale` so
 * resize, rotation, or the embed frame changing size are reflected without
 * a page reload (RN-Dimensions on web is backed by live window metrics).
 */
function readEffectiveDimensions(): { short: number; long: number } {
  const { width, height } = Dimensions.get("window");
  const short = width < height ? width : height;
  const long = width < height ? height : width;
  return {
    short: Math.min(short, WEB_EMBED_PHONE_WIDTH),
    long: Math.min(long, WEB_EMBED_PHONE_HEIGHT),
  };
}

/**
 * Scales a design-px size to the current web mobile screen width.
 * @param size - Design size based on {@link STYLE_GUIDELINE_BASE_WIDTH}
 * @returns Pixel-rounded size capped at phone-glass density
 */
export const scale = (size: number) => {
  const { short } = readEffectiveDimensions();
  return Math.round(
    PixelRatio.roundToNearestPixel((short / STYLE_GUIDELINE_BASE_WIDTH) * size),
  );
};

/**
 * Scales a design-px size to the current web mobile screen height.
 * @param size - Design size based on {@link STYLE_GUIDELINE_BASE_HEIGHT}
 * @returns Pixel-rounded size capped at phone-glass density
 */
export const verticalScale = (size: number) => {
  const { long } = readEffectiveDimensions();
  return Math.round(
    PixelRatio.roundToNearestPixel((long / STYLE_GUIDELINE_BASE_HEIGHT) * size),
  );
};
