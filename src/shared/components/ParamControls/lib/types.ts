/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFDeviceParam } from "@store";
import { GestureResponderEvent, ViewStyle, StyleProp } from "react-native";


export interface ParamControlProps {
  param: ESPCDFDeviceParam;
  disabled?: boolean;
  setUpdating: (updating: boolean) => void;
  showCheckbox?: boolean;
  isSelected?: boolean;
  onSelect?: (selected: boolean) => void;
  onValueChange?: (value: any) => void;
  onOpenChart?: (param: ESPCDFDeviceParam) => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export interface ParamControlChildProps {
  label?: string;
  value?: any;
  onValueChange?: (event: GestureResponderEvent | null, newValue: any, validate?: boolean) => void;
  disabled?: boolean;
  meta?: any
  onOpenChart?: (() => void) | null;
  /**
   * When true, sliders render the compact one-row header (label left, current value right)
   * with no min/max row or below-thumb value text. The drag bubble above the thumb is preserved.
   * Prefer false everywhere except the generic device Fallback panel (`Fallback.tsx`),
   * where list density matters. Scene, schedule, group, and automation flows use the
   * expanded layout (min/max + below-thumb value) by default via ParameterControl.
   */
  compact?: boolean;
}

// Helper function to ensure value is within bounds
/**
 * Handles clamp value logic for this module.
 */
export const clampValue = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

// Helper function to convert value to string safely
/**
 * Handles safe value to string logic for this module.
 */
export const safeValueToString = (value: any): string => {
  if (value === null || value === undefined) return '';
  return String(value);
};

/** Coerce JSON/string numeric param values for stable slider state and comparisons. */
export const normalizeNumericParamValue = (value: any): any => {
  if (value == null || value === "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return value;
};

/** Rounded comparable value for sliders, or null if not numeric. */
export const comparableRoundedParamNumber = (value: any): number | null => {
  const n = normalizeNumericParamValue(value);
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.round(n);
};

// Helper function to get bounds from param
/**
 * Retrieves param bounds for downstream consumers.
 */
export const getParamBounds = (param: ESPCDFDeviceParam) => {
  return {
    ...param?.bounds
  };
};