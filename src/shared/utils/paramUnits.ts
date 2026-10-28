/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFDeviceParam } from "@store";
import {
  ESPRM_BRIGHTNESS_PARAM_TYPE,
  ESPRM_CCT_PARAM_TYPE,
  ESPRM_ENERGY_PARAM_TYPE,
  ESPRM_HUE_PARAM_TYPE,
  ESPRM_SATURATION_PARAM_TYPE,
  ESPRM_TEMPERATURE_PARAM_TYPE,
} from "@shared/utils/constants";
import { PARAM_BOUNDS_VALUE_SUFFIX } from "@shared/utils/paramUtils";

/** Display unit per standard RainMaker param type. */
const UNIT_BY_PARAM_TYPE: Record<string, string> = {
  [ESPRM_TEMPERATURE_PARAM_TYPE]: "°C",
  [ESPRM_ENERGY_PARAM_TYPE]: "kWh",
  [ESPRM_BRIGHTNESS_PARAM_TYPE]: "%",
  [ESPRM_SATURATION_PARAM_TYPE]: "%",
  [ESPRM_CCT_PARAM_TYPE]: "K",
  [ESPRM_HUE_PARAM_TYPE]: "°",
};

/**
 * Resolves the display unit of a param: an explicit `valueSuffix` bound wins,
 * then the standard param type (native devices set `type`, Matter cluster
 * params set `uiType`), otherwise none.
 * @param param - Device param
 * @returns Unit symbol, or an empty string
 */
export const getParamUnit = (
  param: Pick<ESPCDFDeviceParam, "type" | "uiType" | "bounds"> | null | undefined,
): string => {
  if (!param) return "";
  const suffix = param.bounds?.[PARAM_BOUNDS_VALUE_SUFFIX];
  if (typeof suffix === "string" && suffix.length > 0) return suffix;
  return (
    (param.type && UNIT_BY_PARAM_TYPE[param.type]) ||
    (param.uiType && UNIT_BY_PARAM_TYPE[param.uiType]) ||
    ""
  );
};

/**
 * Canonical unit tokens a param may declare on the wire, mapped to the symbol
 * this client renders.
 *
 * The data model carries a machine token (`"celsius"`), never a display symbol:
 * one canonical unit on the wire is what makes values comparable across
 * devices, and the symbol — plus, later, its localization — belongs to the
 * client. This table is therefore the single place a unit token becomes text;
 * no control should spell a symbol itself.
 *
 * The token set is open by design — the data model does not restrict the field,
 * so a device that genuinely reports in fahrenheit declares so and this client
 * must honour it. A token with no entry here is rendered verbatim rather than
 * hidden (see {@link resolveParamUnitSymbol}): showing "14.5 psi" is right,
 * and silently dropping a unit the device declared is not.
 */
export const PARAM_UNIT_SYMBOLS: Readonly<Record<string, string>> =
  Object.freeze({
    celsius: "°C",
    fahrenheit: "°F",
    kelvin: "K",
    lux: "lx",
    percent: "%",
    kpa: "kPa",
    degrees: "°",
    seconds: "s",
    minutes: "min",
    cubic_meters_per_hour: "m³/h",
  });

/**
 * Resolves the display symbol for a declared unit token.
 *
 * A token this build has no symbol for falls back to the token itself, because
 * the device declared a unit and dropping it would misreport the value: a
 * pressure in `psi` shown bare reads as the canonical `kPa`. Only a param that
 * declares no unit at all renders without a suffix.
 * @param unit - Unit token from the param schema, when declared.
 * @returns Display symbol, the raw token when unmapped, or `""` when undeclared.
 */
export function resolveParamUnitSymbol(unit?: string | null): string {
  const token = String(unit ?? "")
    .trim()
    .toLowerCase();
  if (!token) {
    return "";
  }
  return PARAM_UNIT_SYMBOLS[token] ?? token;
}
