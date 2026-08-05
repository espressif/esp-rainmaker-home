/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import { formatTime } from "@shared/utils/common";
import { WRITE_PERMISSION } from "@shared/utils/constants";
import {
  defaultValueBasedOnParamDataType,
  defaultWritableParamValue,
  filterExcludedParamTypes,
} from "@shared/utils/paramUtils";
import type { ScheduleTrigger } from "@src/types/global";
import type { ESPCDFDeviceParam } from "@store";

/**
 * Converts minutes from midnight to hours, minutes, and AM/PM period
 * @param minutes - Minutes from midnight (0-1439)
 * @returns Object with hour (1-12), minute (0-59), and period ("AM" | "PM")
 */
export const convertMinutesToTime = (
  minutes: number
): { hour: number; minute: number; period: "AM" | "PM" } => {
  const totalHours = Math.floor(minutes / 60);
  const hour12 = totalHours % 12 || 12;
  const minute = minutes % 60;
  const period = totalHours >= 12 ? "PM" : "AM";
  return { hour: hour12, minute, period };
};

/**
 * Converts hours, minutes, and AM/PM period to minutes from midnight
 * @param hour - Hour in 12-hour format (1-12)
 * @param minute - Minute (0-59)
 * @param period - "AM" or "PM"
 * @returns Minutes from midnight (0-1439)
 */
export const convertTimeToMinutes = (
  hour: number,
  minute: number,
  period: "AM" | "PM"
): number => {
  let totalHours = hour;
  if (period === "PM" && hour !== 12) {
    totalHours += 12;
  } else if (period === "AM" && hour === 12) {
    totalHours = 0;
  }
  return totalHours * 60 + minute;
};

/**
 * Converts days bitmap to array of day indices (0-6, where 0=Sunday)
 * @param daysBitmap - Bitmap where bit 0 = Sunday, bit 1 = Monday, etc.
 * @returns Array of day indices (0-6)
 */
export const convertDaysBitmapToArray = (daysBitmap: number): number[] => {
  return Array.from({ length: 7 }, (_, i) =>
    daysBitmap & (1 << i) ? i : -1
  ).filter((i) => i !== -1);
};

/**
 * Converts array of day indices to days bitmap
 * @param daysArray - Array of day indices (0-6, where 0=Sunday)
 * @returns Bitmap where bit 0 = Sunday, bit 1 = Monday, etc.
 */
export const convertDaysArrayToBitmap = (daysArray: number[]): number => {
  return daysArray.reduce((acc, day) => acc | (1 << day), 0);
};

/**
 * Filters and processes device parameters for schedule actions
 * @param device - Device to get parameters from
 * @param deviceName - Device name
 * @param nodeId - Node ID
 * @param getActionValue - Function to get current action value for a parameter
 * @returns Array of processed parameters with values
 */
export const getScheduleDeviceParams = (
  device: { params?: ESPCDFDeviceParam[]; name: string },
  nodeId: string,
  getActionValue: (nodeId: string, deviceName: string, paramName: string) => any
): (ESPCDFDeviceParam & { value: any })[] => {
  const filteredParams = filterExcludedParamTypes(device.params);
  if (!filteredParams) return [];

  return filteredParams
    .filter((param) => param.properties?.includes(WRITE_PERMISSION))
    .filter((param) => !!param.name?.trim())
    .map((param) => ({
      ...param,
      value:
        getActionValue(nodeId, device.name, param.name) ??
        defaultWritableParamValue(param),
    })) as (ESPCDFDeviceParam & { value: any })[];
};

/** @deprecated Use defaultValueBasedOnParamDataType from paramUtils */
export const getDefaultValueForParamType = defaultValueBasedOnParamDataType;

/**
 * Formats parameter value for display
 * @param value - Parameter value to format
 * @param t - Translation function
 * @returns Formatted string value
 */
export const formatParamValueForDisplay = (
  value: any,
  t: (key: string) => string
): string => {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean")
    return value
      ? t("schedule.deviceParamsSelection.parameterOn")
      : t("schedule.deviceParamsSelection.parameterOff");
  return value.toString();
};

/**
 * Validates schedule data before save
 * @param scheduleName - Schedule name
 * @param triggers - Schedule triggers
 * @param actions - Schedule actions
 * @returns Object with isValid boolean and error message if invalid
 */
export const validateScheduleData = (
  scheduleName: string,
  triggers: ScheduleTrigger[],
  actions: Record<string, any>
): { isValid: boolean; error?: string } => {
  if (!scheduleName || !scheduleName.trim()) {
    return {
      isValid: false,
      error: "schedule.errors.scheduleCreationFailed",
    };
  }
  if (!triggers || triggers.length === 0) {
    return {
      isValid: false,
      error: "schedule.errors.scheduleCreationFailed",
    };
  }
  if (!actions || Object.keys(actions).length === 0) {
    return {
      isValid: false,
      error: "schedule.errors.scheduleCreationFailed",
    };
  }
  return { isValid: true };
};

/**
 * Gets current time in minutes from midnight
 * @returns Minutes from midnight (0-1439)
 */
export const getCurrentTimeInMinutes = (): number => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

/**
 * Formats time for display (e.g., "12:30 PM")
 * @param minutes - Minutes from midnight
 * @returns Formatted time string
 */
export const formatTimeForDisplay = formatTime;
