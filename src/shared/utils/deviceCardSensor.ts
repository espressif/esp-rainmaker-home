/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFDevice, ESPCDFDeviceParam } from "@store";
import {
  DEVICE_CARD_SENSOR_PARAM_NAME_BATTERY,
  DEVICE_CARD_SENSOR_PARAM_NAME_HUMIDITY,
  DEVICE_CARD_SENSOR_PARAM_NAME_ILLUMINANCE,
  DEVICE_CARD_SENSOR_PARAM_NAME_OCCUPANCY,
  DEVICE_CARD_SENSOR_PARAM_NAME_TEMPERATURE,
  ESPRM_TEMPERATURE_PARAM_TYPE,
  ESPRM_UI_STATUS_PARAM_TYPE,
} from "./constants";
import {
  isUnknownParamValue,
  PARAM_BOUNDS_VALUE_SUFFIX,
} from "./paramUtils";

const DEVICE_CARD_SENSOR_PARAM_NAMES = new Set<string>([
  DEVICE_CARD_SENSOR_PARAM_NAME_TEMPERATURE,
  DEVICE_CARD_SENSOR_PARAM_NAME_HUMIDITY,
  DEVICE_CARD_SENSOR_PARAM_NAME_ILLUMINANCE,
  DEVICE_CARD_SENSOR_PARAM_NAME_OCCUPANCY,
]);

/**
 * Returns whether a param represents a temperature reading.
 * Native RainMaker devices use `type` `esp.param.temperature` with `uiType` `esp.ui.text`;
 * Matter cluster params set `uiType` to `esp.param.temperature` directly.
 * @param param - Device param candidate.
 * @returns `true` when the param is a temperature sensor readout.
 */
function isTemperatureParam(param: ESPCDFDeviceParam): boolean {
  return (
    param.type === ESPRM_TEMPERATURE_PARAM_TYPE ||
    param.uiType === ESPRM_TEMPERATURE_PARAM_TYPE
  );
}

/**
 * Returns whether a param should contribute a live reading on the device card.
 * @param param - Device param candidate.
 * @returns `true` for temperature and sensor status readouts (not battery).
 */
export function isDeviceCardSensorParam(param: ESPCDFDeviceParam): boolean {
  if (isTemperatureParam(param)) {
    return true;
  }

  if (param.uiType !== ESPRM_UI_STATUS_PARAM_TYPE) {
    return false;
  }

  const paramName = String(param.name ?? "");
  if (paramName === DEVICE_CARD_SENSOR_PARAM_NAME_BATTERY) {
    return false;
  }

  if (DEVICE_CARD_SENSOR_PARAM_NAMES.has(paramName)) {
    return true;
  }

  const suffix = param.bounds?.[PARAM_BOUNDS_VALUE_SUFFIX];
  return typeof suffix === "string" && suffix.length > 0;
}

/**
 * Resolves a human-readable label for enum/status sensor values.
 * @param param - Param carrying optional `bounds.labels`.
 * @param value - Raw semantic slug from the device.
 * @returns Display label.
 */
function formatSemanticSensorLabel(
  param: ESPCDFDeviceParam,
  value: string,
): string {
  const labels = param.bounds?.labels as Record<string, string> | undefined;
  const mapped = labels?.[value];
  if (mapped) {
    return mapped;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Formats one sensor param value for compact device-card display.
 * @param param - Sensor param with `uiType`, `value`, and optional bounds.
 * @returns Formatted reading or `null` when the value is missing/unknown.
 */
export function formatDeviceCardSensorReading(
  param: ESPCDFDeviceParam,
): string | null {
  if (isUnknownParamValue(param.value)) {
    return null;
  }

  if (isTemperatureParam(param)) {
    const numericValue = Number(param.value);
    if (!Number.isFinite(numericValue)) {
      return null;
    }
    return `${numericValue.toFixed(1)}°C`;
  }

  if (param.uiType === ESPRM_UI_STATUS_PARAM_TYPE) {
    const rawValue = String(param.value ?? "").trim();
    if (!rawValue) {
      return null;
    }

    const suffix = param.bounds?.[PARAM_BOUNDS_VALUE_SUFFIX];
    if (typeof suffix === "string" && suffix.length > 0) {
      return `${rawValue}${suffix}`;
    }

    return formatSemanticSensorLabel(param, rawValue);
  }

  return null;
}

/**
 * Collects formatted sensor readings for a device card row.
 * Temperature is matched by `type` or `uiType`; other sensors use `uiType` and param name.
 * @param device - CDF device shown on the card.
 * @returns Ordered display strings for all readable sensor params.
 */
export function getDeviceCardSensorReadings(device: ESPCDFDevice): string[] {
  return (device.params ?? [])
    .filter(isDeviceCardSensorParam)
    .map(formatDeviceCardSensorReading)
    .filter((reading): reading is string => reading != null);
}
