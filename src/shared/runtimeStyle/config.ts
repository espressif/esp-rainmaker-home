/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// Picks the active style once at start-up: the page URL `brand` parameter on web, else the saved style on the phone.

import { Appearance } from "react-native";

import { BRAND_URL_PARAM } from "@shared/utils/constants";
import { readSaved } from "./store";
import { getColors, chooseTheme } from "./resolve";
import {
  readUrlParam,
  decodeUrlStyle,
  parseUrlStyle,
  type StyleConfig,
  type StyleDocument,
  type StyleParam,
  type StyleTheme,
  type StyleValidation,
} from "./schema";

/**
 * Reads the `brand` URL parameter from the page location.
 * @returns The encoded value and its separator, or null when absent or off-web
 */
function readStyleParam(): StyleParam | null {
  try {
    const location = (globalThis as { location?: { search?: string; hash?: string } }).location;
    return location ? readUrlParam(location) : null;
  } catch {
    return null;
  }
}

/**
 * Validates a decoded style document and logs when it cannot be drawn.
 * @param source - Where the document came from, for the warning
 * @param value - The parsed document
 * @param validate - The validator for that source
 * @returns The style document, or null when invalid
 */
function validated(
  source: string,
  value: unknown,
  validate: (value: unknown) => StyleValidation,
): StyleDocument | null {
  const { style, error } = validate(value);
  if (error) console.warn(`[RuntimeStyle] Ignoring the ${source} style: ${error}`);
  return style ?? null;
}

/** Page URL `brand` parameter, read once when this module loads. */
const styleParam = readStyleParam();

/**
 * @returns The style document from the page URL `brand` parameter, or null when absent/invalid/off-web
 */
function fromQueryParam(): StyleDocument | null {
  return styleParam
    ? validated("page URL", decodeUrlStyle(styleParam.raw), parseUrlStyle)
    : null;
}

const document: StyleDocument | null = fromQueryParam() ?? readSaved();

/** Resolved runtime style config, or null when the app shows its default look. */
export const styleConfig: StyleConfig | null = document?.config ?? null;

/** Theme the app shows, chosen once when the module loads. */
export const styleTheme: StyleTheme = chooseTheme(
  document?.config.supportedThemes,
  Appearance.getColorScheme(),
);

/** Whether the runtime style sets colours for the active theme. */
export const hasPalette: boolean =
  Object.keys(getColors(styleConfig, styleTheme)).length > 0;

/** `?brand=` / `#brand=` suffix to forward to the embedded app, or `""` when absent. */
export const styleQuery: string = styleParam
  ? `${styleParam.separator}${BRAND_URL_PARAM}=${encodeURIComponent(styleParam.raw)}`
  : "";
