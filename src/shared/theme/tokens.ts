/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { BRAND_THEME_DARK, BRAND_THEME_LIGHT } from "@shared/utils/constants";
import { scale, verticalScale } from "@shared/utils/styling";
import { styleConfig, styleTheme } from "@shared/runtimeStyle/config";
import { getColors, getRadius, type ColorToken } from "@shared/runtimeStyle/resolve";

type ThemeColors = Record<ColorToken, string> & { width: number };

const themes = {
  light: {
    colors: {
      white: "#ffffff",
      black: "#000000",
      bluetooth: "#2c5aa0",
      gray: "#7f8c8d",
      lightGray: "#bdc3c7",
      red: "#e74c3c",
      orange: "#f39c12",
      blue: "#2c5aa0",
      green: "#27ae60",
      yellow: "#f1c40f",
      lightBlue: "rgba(44, 90, 160, .3)",

      bg: "#f5f6f7",
      bg1: "#e8eef7",
      bg2: "#d4e0f0",
      bg3: "#b0c7e3",
      bg4: "rgba(44, 90, 160, 0.15)",
      bg5: "#f8f9fa",
      borderColor: "rgba(218, 218, 218, 0.62)",
      darkBorderColor: "#cbd5e1",

      primary: "#2c5aa0",

      text_primary: "#1e293b",
      text_primary_light: "#334155",
      text_primary_dark: "#0f172a",

      text_secondary: "#64748b",
      text_secondary_light: "#475569",
      text_secondary_dark: "#334155",

      warn: "#b25b00",
      error: "#b71c1c",
      success: "#237804",

      warnBg: "#FFF4D6",
      errorBg: "#FADADA",
      successBg: "#D9F7BE",
      qrCodeScanLoader: "#1875D6",
    },
  },
  dark: {
    colors: {
      white: "#333",
      black: "#fff",
      bluetooth: "#2196f3",
      gray: "#a0a0a0",
      lightGray: "#666",
      red: "#ff6b6b",
      orange: "#ff7043",
      blue: "#64b5f6",
      green: "#66bb6a",
      yellow: "#ffd54f",
      lightBlue: "rgba(100, 181, 246, .6)",

      bg: "#121212",
      bg1: "#121212",
      bg2: "#1e1e1e",
      bg3: "#2d2d2d",
      bg4: "rgba(255, 255, 255, .1)",
      borderColor: "#595959",

      primary: "#64b5f6",

      text_primary: "#f0f0f0",
      text_primary_light: "#ffffff",
      text_primary_dark: "#e0e0e0",

      text_secondary: "#a0a0a0",
      text_secondary_light: "#cccccc",
      text_secondary_dark: "#808080",

      warn: "#ffde8e",
      error: "#ed7e7e",
      success: "#5ce712",

      warnBg: "#ffde8e",
      errorBg: "#ed7e7e",
      successBg: "#5ce712",
      qrCodeScanLoader: "#1875D6",
    },
  },
};

Object.assign(themes.light.colors, getColors(styleConfig, BRAND_THEME_LIGHT));
Object.assign(themes.dark.colors, getColors(styleConfig, BRAND_THEME_DARK));

const STYLE_RADIUS_MD: number = getRadius(styleConfig);

let currentThemeName: keyof typeof themes = styleTheme;

// Function to set the current theme
/**
 * Updates current theme with the provided input.
 */
export function setCurrentTheme(name: keyof typeof themes) {
  if (themes[name]) {
    currentThemeName = name;
  } else {
    console.warn(`Theme ${name} does not exist`);
  }
}

// Get current theme name
/**
 * Retrieves current theme for downstream consumers.
 */
export function getCurrentTheme(): keyof typeof themes {
  return currentThemeName;
}

// Proxy handler to get colors dynamically from the current theme
const colorsProxy = new Proxy(
  {},
  {
    get(_: object, prop: keyof ThemeColors) {
      const themeColors = themes[currentThemeName].colors;
      if (prop in themeColors) {
        return themeColors[prop as keyof typeof themeColors];
      } else {
        console.warn(
          `Color "${prop}" not found in theme "${currentThemeName}"`
        );
        return undefined;
      }
    },
  }
) as ThemeColors;

export const tokens = {
  colors: colorsProxy,

  fontSize: {
    xxs: scale(10),
    xs: scale(12),
    sm: scale(14),
    _15: scale(15),
    md: scale(16),
    lg: scale(18),
    xl: scale(22),
  },

  fonts: {
    regular: "'Poppins-Regular', 'Avenir', Helvetica, Arial, sans-serif",
    medium: "'Poppins-Medium', 'Avenir', Helvetica, Arial, sans-serif",
  },

  radius: {
    sm: verticalScale(STYLE_RADIUS_MD * (10 / 16)),
    md: verticalScale(STYLE_RADIUS_MD),
  },

  spacing: {
    _5: scale(5),
    _10: scale(10),
    _15: scale(15),
    _20: scale(20),
    _30: scale(30),
    _40: scale(40),
  },

  border: {
    defaultWidth: 1.5,
  },

  iconSize: {
    _15: scale(15),
    _20: scale(20),
  },

};
