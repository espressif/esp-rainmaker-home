/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

export const ESPRMMatterBaseAdaptorIdentifier = "rainmaker-matter-sdk";

/** Thrown from Matter group ops when the home must be converted before `getFabricDetails`. */
export const MATTER_NEEDS_FABRIC_CONVERSION = "MATTER_NEEDS_FABRIC_CONVERSION";

// MATTER CLUSTER IDS
export const MATTER_CLUSTER_ID_ON_OFF = 0x0006;
export const MATTER_CLUSTER_ID_LEVEL_CONTROL = 0x0008;
export const MATTER_CLUSTER_ID_COLOR_CONTROL = 0x0300;
export const MATTER_CLUSTER_ID_RVC_RUN_MODE = 0x0054;
export const MATTER_CLUSTER_ID_RVC_CLEAN_MODE = 0x0055;
export const MATTER_CLUSTER_ID_RVC_OPERATIONAL_STATE = 0x0061;
export const MATTER_CLUSTER_ID_POWER_SOURCE = 0x002f;
export const MATTER_CLUSTER_ID_DOOR_LOCK = 0x0101;
export const MATTER_CLUSTER_ID_ILLUMINANCE_MEASUREMENT = 0x0400;
export const MATTER_CLUSTER_ID_TEMPERATURE_MEASUREMENT = 0x0402;
export const MATTER_CLUSTER_ID_RELATIVE_HUMIDITY_MEASUREMENT = 0x0405;
export const MATTER_CLUSTER_ID_OCCUPANCY_SENSING = 0x0406;

/** Prefix for Matter cluster param types in `params.config` (`server:0x…`). */
export const MATTER_SERVER_PARAM_TYPE_PREFIX = "server:0x";

/**
 * Builds the param-control type token for a Matter server cluster.
 * @param clusterId - Matter cluster id.
 * @returns Type string matched in `PARAM_CONTROLS` (e.g. `server:0x6`).
 */
export function toMatterServerParamType(clusterId: number): string {
  return `${MATTER_SERVER_PARAM_TYPE_PREFIX}${clusterId.toString(16)}`;
}

/** Matter cluster param types referenced from `params.config` / device param matching. */
export const MATTER_SERVER_PARAM_TYPE_ON_OFF = toMatterServerParamType(
  MATTER_CLUSTER_ID_ON_OFF,
);
export const MATTER_SERVER_PARAM_TYPE_LEVEL_CONTROL = toMatterServerParamType(
  MATTER_CLUSTER_ID_LEVEL_CONTROL,
);
export const MATTER_SERVER_PARAM_TYPE_COLOR_CONTROL = toMatterServerParamType(
  MATTER_CLUSTER_ID_COLOR_CONTROL,
);
export const MATTER_SERVER_PARAM_TYPE_RVC_RUN_MODE = toMatterServerParamType(
  MATTER_CLUSTER_ID_RVC_RUN_MODE,
);
export const MATTER_SERVER_PARAM_TYPE_RVC_CLEAN_MODE = toMatterServerParamType(
  MATTER_CLUSTER_ID_RVC_CLEAN_MODE,
);
export const MATTER_SERVER_PARAM_TYPE_POWER_SOURCE = toMatterServerParamType(
  MATTER_CLUSTER_ID_POWER_SOURCE,
);
export const MATTER_SERVER_PARAM_TYPE_DOOR_LOCK = toMatterServerParamType(
  MATTER_CLUSTER_ID_DOOR_LOCK,
);

/** Prefix for Matter device type tokens in `devices.config` (`matter:…`). */
export const MATTER_DEVICE_TYPE_PREFIX = "matter:";

// MATTER DEVICE TYPE IDS
export const MATTER_DEVICE_TYPE_ID_DOOR_LOCK = 10;
export const MATTER_DEVICE_TYPE_ID_RVC = 17;
export const MATTER_DEVICE_TYPE_ID_EXTENDED_COLOR_LIGHT = 269;
export const MATTER_DEVICE_TYPE_ID_GENERIC_SENSOR = 263;
export const MATTER_DEVICE_TYPE_ID_ILLUMINANCE_SENSOR = 106;
export const MATTER_DEVICE_TYPE_ID_OCCUPANCY_SENSOR = 107;
export const MATTER_DEVICE_TYPE_ID_TEMPERATURE_SENSOR = 302;
export const MATTER_DEVICE_TYPE_ID_HUMIDITY_SENSOR = 307;

/**
 * Builds the device-type token used in `devices.config` / `extractDeviceType`.
 * @param deviceTypeId - Matter device type id (decimal).
 * @returns Type string (e.g. `matter:302`).
 */
export function toMatterDeviceType(deviceTypeId: number): string {
  return `${MATTER_DEVICE_TYPE_PREFIX}${deviceTypeId}`;
}

/** Matter device type tokens referenced from `devices.config` and device-card gating. */
export const MATTER_DEVICE_TYPE_DOOR_LOCK = toMatterDeviceType(
  MATTER_DEVICE_TYPE_ID_DOOR_LOCK,
);
export const MATTER_DEVICE_TYPE_RVC = toMatterDeviceType(
  MATTER_DEVICE_TYPE_ID_RVC,
);
export const MATTER_DEVICE_TYPE_EXTENDED_COLOR_LIGHT = toMatterDeviceType(
  MATTER_DEVICE_TYPE_ID_EXTENDED_COLOR_LIGHT,
);
export const MATTER_DEVICE_TYPE_GENERIC_SENSOR = toMatterDeviceType(
  MATTER_DEVICE_TYPE_ID_GENERIC_SENSOR,
);
export const MATTER_DEVICE_TYPE_ILLUMINANCE_SENSOR = toMatterDeviceType(
  MATTER_DEVICE_TYPE_ID_ILLUMINANCE_SENSOR,
);
export const MATTER_DEVICE_TYPE_OCCUPANCY_SENSOR = toMatterDeviceType(
  MATTER_DEVICE_TYPE_ID_OCCUPANCY_SENSOR,
);
export const MATTER_DEVICE_TYPE_TEMPERATURE_SENSOR = toMatterDeviceType(
  MATTER_DEVICE_TYPE_ID_TEMPERATURE_SENSOR,
);
export const MATTER_DEVICE_TYPE_HUMIDITY_SENSOR = toMatterDeviceType(
  MATTER_DEVICE_TYPE_ID_HUMIDITY_SENSOR,
);
