/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  StyleSheet,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

type RNStyle = ViewStyle | TextStyle | ImageStyle;

/**
 * Flattens a React Native style prop (including arrays) into a single object.
 * Use on web when passing styles to DOM-backed or third-party components that
 * do not accept RN style arrays (e.g. Tamagui, animated SVG wrappers).
 * @param style - Style prop value, object or array.
 * @returns Single style object, or undefined when empty.
 */
export function flattenStyle<T extends RNStyle = ViewStyle>(
  style: StyleProp<T> | undefined,
): T | undefined {
  if (style == null) {
    return undefined;
  }

  const flat = StyleSheet.flatten(style);
  if (flat == null || Object.keys(flat).length === 0) {
    return undefined;
  }

  return flat as T;
}
