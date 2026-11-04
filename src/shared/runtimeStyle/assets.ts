/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ImageSourcePropType } from "react-native";

import type { IllustrationName } from "./keys";
import { styleConfig, styleTheme } from "./config";
import { getLogoUri, getDeviceIconUri, getIllustrationUri } from "./resolve";

/**
 * Prefers a style URI; otherwise keeps the bundled asset.
 * @param uri - Style image URI, if any
 * @param bundled - Bundled fallback
 * @returns `{ uri }` or the bundled `require()`
 */
function withFallback(uri: string | undefined, bundled: ImageSourcePropType): ImageSourcePropType {
  return uri ? { uri } : bundled;
}

/**
 * Resolves the logo for the active style theme.
 * @param bundled - Bundled logo when the style sets none
 * @returns Image source to render
 */
export function resolveLogo(bundled: ImageSourcePropType): ImageSourcePropType {
  return withFallback(getLogoUri(styleConfig, styleTheme), bundled);
}

/**
 * Resolves a device icon from the active style (online keys fall back to offline).
 * @param key - Icon key, optionally suffixed with `-online`
 * @param bundled - Bundled fallback
 * @returns Image source to render
 */
export function resolveDeviceIcon(
  key: string,
  bundled: ImageSourcePropType,
): ImageSourcePropType {
  return withFallback(getDeviceIconUri(styleConfig, key), bundled);
}

/**
 * Resolves an illustration from the active style.
 * @param name - Illustration name
 * @param bundled - Bundled fallback
 * @returns Image source to render
 */
export function resolveIllustration(
  name: IllustrationName,
  bundled: ImageSourcePropType,
): ImageSourcePropType {
  return withFallback(getIllustrationUri(styleConfig, name), bundled);
}
