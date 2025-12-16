/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

export interface FontSizes {
  base: number;
  lineHeight: number;
  heading1: number;
  heading2: number;
  heading3: number;
  timestamp: number;
}

/**
 * Get font sizes based on level (1-4)
 * @param level - Font size level (1-4)
 * @returns Font sizes configuration
 */
export const getFontSizes = (level: number): FontSizes => {
  const sizes: Record<number, FontSizes> = {
    1: {
      base: 12,
      lineHeight: 18,
      heading1: 16,
      heading2: 14,
      heading3: 13,
      timestamp: 9,
    },
    2: {
      base: 16,
      lineHeight: 24,
      heading1: 20,
      heading2: 18,
      heading3: 16,
      timestamp: 11,
    },
    3: {
      base: 20,
      lineHeight: 30,
      heading1: 24,
      heading2: 22,
      heading3: 20,
      timestamp: 13,
    },
    4: {
      base: 24,
      lineHeight: 36,
      heading1: 28,
      heading2: 26,
      heading3: 24,
      timestamp: 15,
    },
  };
  return sizes[level as keyof typeof sizes] || sizes[2];
};

