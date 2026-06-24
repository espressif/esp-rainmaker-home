/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFDevice, ESPCDFDeviceParam } from "@store";
import { PARAM_CONTROLS } from "@/config/params.config";
import { MATTER_SERVER_PARAM_TYPE_ON_OFF } from "@config/matter.constants";
import {
  ESPRM_POWER_PARAM_TYPE,
  ESPRM_UI_HIDDEN_PARAM_TYPE,
  ESPRM_UI_SLIDER_PARAM_TYPE,
} from "@shared/utils/constants";
/** SDK / Matter device may expose `primaryParam` (e.g. OnOff) on the device or `_raw`. */
type DevicePrimaryParamRef = {
  primaryParam?: { type?: string };
  _raw?: { primaryParam?: { type?: string } };
};

/**
 * Type definition for a parameter control configuration
 */
export interface ParamControlConfig {
  name: string;
  types: string[];
  control: React.ComponentType<any> | null;
  dataTypes?: string[];
  derivedMeta?: Record<string, string>[];
  [key: string]: any;
}

/**
 * Type definition for the params map
 */
export type ParamsMap = Record<string, ParamControlConfig>;

/**
 * RainMaker power param or Matter OnOff (`MATTER_SERVER_PARAM_TYPE_ON_OFF`) when no primary param is set.
 * @param params - Device parameters
 * @returns Matching power param, if any
 */
const findLegacyDeviceCardPowerParam = (
  params: ESPCDFDeviceParam[] | undefined
): ESPCDFDeviceParam | undefined =>
  params?.find(
    (param) =>
      param.type === ESPRM_POWER_PARAM_TYPE ||
      param.type === MATTER_SERVER_PARAM_TYPE_ON_OFF
  );

/** Types that are valid power/toggle params for the device card switch. */
const POWER_COMPATIBLE_TYPES = new Set([
  ESPRM_POWER_PARAM_TYPE,
  MATTER_SERVER_PARAM_TYPE_ON_OFF,
]);

/**
 * Resolves the param that drives the device card power switch.
 * Prefers SDK `primaryParam` only when its type is a known power/onoff type,
 * otherwise it falls back to the type-based legacy lookup.
 * @param device - CDF device for the card
 * @returns Power param to toggle, or undefined when none applies
 */
export const resolveDeviceCardPowerParam = (
  device: ESPCDFDevice | undefined
): ESPCDFDeviceParam | undefined => {
  const params = device?.params;
  if (!params?.length) {
    return undefined;
  }

  const deviceRef = device as DevicePrimaryParamRef;
  const primaryType =
    deviceRef.primaryParam?.type ?? deviceRef._raw?.primaryParam?.type;
  if (primaryType && POWER_COMPATIBLE_TYPES.has(primaryType)) {
    const fromPrimary = params.find((param) => param.type === primaryType);
    if (fromPrimary) {
      return fromPrimary;
    }
  }

  return findLegacyDeviceCardPowerParam(params);
};

/**
 * Builds a map of parameter types to their control configurations.
 * Single Responsibility: Only responsible for building the params map.
 * @returns A map where keys are parameter types and values are control configurations
 */
export const buildParamsMap = (): ParamsMap => {
  return PARAM_CONTROLS.reduce((acc, control) => {
    if (control.types.includes(ESPRM_UI_HIDDEN_PARAM_TYPE)) {
      return acc;
    }
    control.types.forEach((type) => {
      acc[type] = control as ParamControlConfig;
    });
    return acc;
  }, {} as ParamsMap);
};

/**
 * Resolves the appropriate control configuration for a given parameter.
 * Single Responsibility: Only responsible for resolving the control for a parameter.
 * @param param - The device parameter
 * @param paramsMap - The map of parameter types to control configurations
 * @returns The control configuration or null if not found
 */
export const resolveParamControl = (
  param: ESPCDFDeviceParam,
  paramsMap: ParamsMap
): ParamControlConfig | null => {
  const lookupKey = param.uiType ?? param.type;
  if (!lookupKey) {
    return null;
  }

  let control = paramsMap[lookupKey];
  if (!control) {
    return null;
  }

  // Special handling for slider parameters that may have a specific type-based control
  if (
    param.uiType === ESPRM_UI_SLIDER_PARAM_TYPE &&
    param.type &&
    paramsMap[param.type] !== undefined
  ) {
    control = paramsMap[param.type];
  }

  return control;
};

/**
 * Resolves the label shown for a parameter control.
 * Uses the device/cloud `name` when present; otherwise the `PARAM_CONTROLS` entry `name`.
 * @param param - The device parameter
 * @param paramsMap - Optional pre-built params map (reuse when rendering many params)
 * @returns Display label, or empty string when neither source applies
 */
export const resolveParamDisplayLabel = (
  param: ESPCDFDeviceParam,
  paramsMap?: ParamsMap,
): string => {
  const fromParam = String(param.name ?? "").trim();
  if (fromParam.length > 0) {
    return fromParam;
  }

  const map = paramsMap ?? buildParamsMap();
  const control = resolveParamControl(param, map);
  return String(control?.name ?? "").trim();
};

/**
 * Processes derived metadata for a parameter by updating its bounds.
 * Single Responsibility: Only responsible for processing derived metadata.
 * @param param - The parameter to process
 * @param control - The control configuration with derivedMeta
 * @param allParams - All device parameters to search for derived values
 */
export const processDerivedMeta = (
  param: ESPCDFDeviceParam,
  control: ParamControlConfig,
  allParams: ESPCDFDeviceParam[]
): void => {
  if (!control.derivedMeta || control.derivedMeta.length === 0) {
    return;
  }

  if (!param.bounds) {
    return;
  }

  control.derivedMeta.forEach((derivedParamConfig) => {
    const first = Object.entries(derivedParamConfig)[0];
    if (!first) return;
    const [name, type] = first;
    const derivedParam = allParams.find((p) => p.type === type);
    if (derivedParam && param.bounds) {
      param.bounds[name] = derivedParam.value;
    }
  });
};

/**
 * Filters device parameters by excluding specified parameter types.
 * Single Responsibility: Only responsible for filtering parameters by type.
 * @param params - Array of device parameters
 * @param excludedTypes - Array of parameter types to exclude
 * @returns Filtered array of parameters
 */
export const filterDeviceParamsByType = (
  params: ESPCDFDeviceParam[] | undefined,
  excludedTypes: string[]
): ESPCDFDeviceParam[] => {
  if (!params) {
    return [];
  }

  return params.filter(
    (param) =>
      Boolean(param.type) && !excludedTypes.includes(param.type as string)
  );
};

/**
 * Configuration for rendering device parameters
 */
export interface RenderParamsConfig {
  params: ESPCDFDeviceParam[];
  paramsMap: ParamsMap;
  allParams: ESPCDFDeviceParam[];
  isConnected: boolean;
  onSetUpdating: (updating: boolean) => void;
}

/**
 * Processes a single parameter and returns the resolved control.
 * Single Responsibility: Only responsible for processing a single parameter.
 * @param param - The parameter to process
 * @param config - Configuration object containing paramsMap, allParams, etc.
 * @returns The resolved control configuration or null
 */
export const processParam = (
  param: ESPCDFDeviceParam,
  config: Omit<RenderParamsConfig, "params">
): ParamControlConfig | null => {
  const control = resolveParamControl(param, config.paramsMap);
  if (!control) {
    return null;
  }

  processDerivedMeta(param, control, config.allParams);
  return control;
};
