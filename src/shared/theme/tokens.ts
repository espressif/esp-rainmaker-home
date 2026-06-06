/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { scale, verticalScale } from "@shared/utils/styling";

type ThemeColors = {
  white: string;
  black: string;
  bluetooth: string;
  gray: string;
  lightGray: string;
  red: string;
  orange: string;
  blue: string;
  green: string;
  yellow: string;
  lightBlue: string;
  bg: string;
  bg1: string;
  bg2: string;
  bg3: string;
  bg4: string;
  bg5: string;
  borderColor: string;
  width: number;
  darkBorderColor: string;
  primary: string;
  text_primary: string;
  text_primary_light: string;
  text_primary_dark: string;
  text_secondary: string;
  text_secondary_light: string;
  text_secondary_dark: string;

  warn: string;
  error: string;
  success: string;

  warnBg: string;
  errorBg: string;
  successBg: string;

  qrCodeScanLoader: string;
};

const themes = {
  light: {
    colors: {
      white: "#ffffff",
      black: "#000000",
      bluetooth: "#0f766e",
      gray: "#94a3b8",
      lightGray: "#e2e8f0",
      red: "#dc2626",
      orange: "#ea580c",
      blue: "#0f766e",
      green: "#059669",
      yellow: "#ca8a04",
      lightBlue: "rgba(15, 118, 110, .15)",

      bg: "#f9fafb",
      bg1: "#f3f4f6",
      bg2: "#e5e7eb",
      bg3: "#d1d5db",
      bg4: "rgba(15, 118, 110, 0.08)",
      bg5: "#fafbfc",
      borderColor: "rgba(209, 213, 219, 0.5)",
      darkBorderColor: "#d1d5db",

      primary: "#0f766e",

      text_primary: "#0f172a",
      text_primary_light: "#1e293b",
      text_primary_dark: "#000000",

      text_secondary: "#475569",
      text_secondary_light: "#64748b",
      text_secondary_dark: "#334155",

      warn: "#d97706",
      error: "#dc2626",
      success: "#059669",

      warnBg: "#fef3c7",
      errorBg: "#fee2e2",
      successBg: "#d1fae5",
      qrCodeScanLoader: "#0f766e",
    },
  },
  dark: {
    colors: {
      white: "#1a1a1a",
      black: "#f5f5f5",
      bluetooth: "#14b8a6",
      gray: "#9ca3af",
      lightGray: "#404040",
      red: "#f87171",
      orange: "#fb923c",
      blue: "#14b8a6",
      green: "#34d399",
      yellow: "#facc15",
      lightBlue: "rgba(20, 184, 166, .25)",

      bg: "#0f172a",
      bg1: "#1a2332",
      bg2: "#1e2938",
      bg3: "#2d3748",
      bg4: "rgba(20, 184, 166, 0.1)",
      bg5: "#151e2b",
      borderColor: "rgba(51, 65, 85, 0.5)",
      darkBorderColor: "#475569",

      primary: "#14b8a6",

      text_primary: "#f5f5f5",
      text_primary_light: "#ffffff",
      text_primary_dark: "#e5e7eb",

      text_secondary: "#d1d5db",
      text_secondary_light: "#f3f4f6",
      text_secondary_dark: "#9ca3af",

      warn: "#f97316",
      error: "#f87171",
      success: "#34d399",

      warnBg: "#fed7aa",
      errorBg: "#fecaca",
      successBg: "#a7f3d0",
      qrCodeScanLoader: "#14b8a6",
    },
  },
};

// Default theme selected
let currentThemeName: keyof typeof themes = "light";

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
    sm: verticalScale(10),
    md: verticalScale(16),
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
