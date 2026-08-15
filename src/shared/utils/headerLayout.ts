/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Platform } from "react-native";

import {
  HEADER_ANDROID_INSET_EXTRA,
  HEADER_CONTENT_HEIGHT_ANDROID,
  HEADER_CONTENT_HEIGHT_IOS,
  HEADER_IOS_TOP_RATIO,
  PLATFORM_IOS,
} from "@shared/utils/constants";

/**
 * Top padding above the header content row — same formula as `Header`.
 * @param insetsTop - Safe-area top inset
 * @param windowHeight - Window height (used for the iOS ratio)
 * @returns Padding in pixels
 */
export function getHeaderPaddingTop(
  insetsTop: number,
  windowHeight: number
): number {
  return Platform.OS === PLATFORM_IOS
    ? windowHeight * HEADER_IOS_TOP_RATIO
    : insetsTop + HEADER_ANDROID_INSET_EXTRA;
}

/**
 * Approximate header height used for toast placement (safe top + content row).
 * @param insetsTop - Safe-area top inset
 * @param windowHeight - Window height (used for the iOS ratio)
 * @returns Header height in pixels
 */
export function getHeaderHeight(
  insetsTop: number,
  windowHeight: number
): number {
  const contentHeight =
    Platform.OS === PLATFORM_IOS
      ? HEADER_CONTENT_HEIGHT_IOS
      : HEADER_CONTENT_HEIGHT_ANDROID;

  return getHeaderPaddingTop(insetsTop, windowHeight) + contentHeight;
}

/**
 * Screen-top offset so a toast sits just below the header.
 * Formula: inset/header-top + header content.
 * @param insetsTop - Safe-area top inset
 * @param windowHeight - Window height (used for the iOS ratio)
 * @returns Toast overlay `paddingTop` in pixels
 */
export function getToastTopOffset(
  insetsTop: number,
  windowHeight: number
): number {
  return getHeaderHeight(insetsTop, windowHeight);
}
