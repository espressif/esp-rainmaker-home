/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPRMDeviceParam } from "@espressif/rainmaker-base-sdk";
import { GestureResponderEvent, ViewStyle, StyleProp } from "react-native";


export interface ParamControlProps {
  param: ESPRMDeviceParam;
  disabled?: boolean;
  setUpdating: (updating: boolean) => void;
  showCheckbox?: boolean;
  isSelected?: boolean;
  onSelect?: (selected: boolean) => void;
  onValueChange?: (value: any) => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export interface ParamControlChildProps {
  label?: string;
  value?: any;
  onValueChange?: (event: GestureResponderEvent | null, newValue: any, validate?: boolean) => void;
  disabled?: boolean;
  meta?: any
}

// Helper function to ensure value is within bounds
export const clampValue = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

// Helper function to convert value to string safely
export const safeValueToString = (value: any): string => {
  if (value === null || value === undefined) return '';
  return String(value);
};

// Helper function to get bounds from param
export const getParamBounds = (param: ESPRMDeviceParam) => {
  return {
    ...param?.bounds
  };
};