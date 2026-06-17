/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { PARAM_CONTROLS } from "@/config/params.config";
import type { ESPCDFDeviceParam } from "@store";
import type { DeviceParamGroup } from "@src/types/global";
import {
  ESPRM_NAME_PARAM_TYPE,
  ESPRM_POWER_PARAM_TYPE,
  ESPRM_UI_HIDDEN_PARAM_TYPE,
  ESPRM_UI_PUSH_BUTTON_PARAM_TYPE,
  ESPRM_UI_TOGGLE_PARAM_TYPE,
  PARAM_CONTROL_INVOKE_VALUE,
  PARAM_VALUE_UNKNOWN,
} from "./constants";

// --- Control lookup ---

/**
 * UI Control Map for parameter types
 * Maps parameter types to their corresponding UI controls
 * This is a memoized map that can be reused across components
 */
export const getParamsUIMap = (): Record<string, DeviceParamGroup["control"]> => {
  return PARAM_CONTROLS.reduce((acc, control) => {
    if (control.types.includes("esp.ui.hidden")) return acc;
    control.types.forEach((type) => {
      acc[type] = {
        types: control.types,
        control: control.control,
      };
    });
    return acc;
  }, {} as Record<string, DeviceParamGroup["control"]>);
};

/**
 * Gets the UI control component for a given parameter
 * @param param - The device parameter
 * @param paramsUIMap - Optional pre-computed UI map (for performance)
 * @returns The React component for the parameter control, or null if not found
 */
export const getParamControlComponent = (
  param: ESPCDFDeviceParam,
  paramsUIMap?: Record<string, DeviceParamGroup["control"]>
): any => {
  const uiMap = paramsUIMap || getParamsUIMap();
  let Control = uiMap[param.uiType ?? ""]?.control as any;
  if (!Control) {
    Control = uiMap[param.type ?? ""]?.control as any;
  }
  if (!Control) {
    return null;
  }
  return Control || null;
};

/**
 * Returns a default value based on parameter data type
 * @param type - The parameter data type (string, int, bool, float)
 * @returns Default value for the given type
 */
export const defaultValueBasedOnParamDataType = (type: string) => {
  const normalizedType = String(type ?? "").trim().toLowerCase();
  switch (normalizedType) {
    case "string":
      return "";
    case "int":
      return 0;
    case "bool":
    case "boolean":
      return false;
    case "float":
      return 0.0;
    default:
      return "";
  }
};

/**
 * Uses {@link defaultValueBasedOnParamDataType}, then infers boolean defaults when
 * RMNG/cloud config omits or mislabels `dataType` (e.g. Power ends up as "string").
 * Used for schedule/scene/automation pickers so toggle params don't save as "".
 */
/** `type` / `uiType` fields used to detect Power, toggle, and push-button controls. */
export type BooleanControlParamLabels = {
  type?: string;
  uiType?: string;
};

/**
 * Whether `type` / `uiType` identify params that must round-trip as booleans in the UI.
 * Used by store params and Matter subscription routing where only labels are available.
 * @param labels - Param `type` and `uiType` (e.g. from ESPCDF or Matter SDK config).
 * @returns True when the param should be coerced/treated as a boolean control.
 */
export function isBooleanControlParamByLabels(
  labels: BooleanControlParamLabels,
): boolean {
  const t = labels.type ?? "";
  const ui = labels.uiType ?? "";
  return (
    t === ESPRM_POWER_PARAM_TYPE ||
    ui === ESPRM_UI_TOGGLE_PARAM_TYPE ||
    ui === ESPRM_UI_PUSH_BUTTON_PARAM_TYPE
  );
}

/** Power / toggle / push-button params that must round-trip as real booleans in the UI. */
export function isBooleanControlParam(param: ESPCDFDeviceParam): boolean {
  return isBooleanControlParamByLabels(param);
}

/**
 * Coerces Matter / RainMaker param values for boolean UI controls.
 * Matter resolvers often emit `"true"` / `"false"` strings; `Boolean("false")`
 * is `true` in JS and breaks toggles after local subscription updates.
 */
export function coerceParamValueToBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "") {
      return false;
    }
  }
  return Boolean(value);
}

// --- Param data type resolution & value coercion ---

/** Effective wire type of a param value, as the firmware understands it. */
export type ResolvedParamDataType =
  | "int"
  | "float"
  | "bool"
  | "string"
  | "object"
  | "array";

/** Subset of param metadata needed to resolve the effective data type. */
export type ParamTypeMetadata = {
  dataType?: string;
  type?: string;
  uiType?: string;
  value?: unknown;
  bounds?: Record<string, any>;
};

/**
 * Resolves the effective data type of a param value.
 *
 * Normalizes the declared `dataType` (rmng-base-sdk >= 1.2.1 delivers it
 * reliably; older versions dropped it on the node-config cache round trip).
 * For params with no usable declaration, falls back to boolean-control
 * labels and the current value's JS type.
 */
export function resolveParamDataType(
  param: ParamTypeMetadata,
): ResolvedParamDataType {
  const declared = String(param.dataType ?? "").trim().toLowerCase();
  if (declared === "int" || declared === "integer") return "int";
  if (declared === "float" || declared === "double") return "float";
  if (declared === "bool" || declared === "boolean") return "bool";
  if (declared === "object") return "object";
  if (declared === "array") return "array";

  if (isBooleanControlParamByLabels(param)) return "bool";

  if (typeof param.value === "number") {
    return Number.isInteger(param.value) ? "int" : "float";
  }
  if (typeof param.value === "boolean") return "bool";
  return "string";
}

/**
 * Coerces a UI-held param value to the type the firmware expects. Always
 * returns a value the firmware can parse — never throws or rejects.
 *
 * Numeric types: empty/missing/unparseable values become the lower bound
 * (or 0) so an untouched slider saves its displayed default instead of `""`;
 * numeric strings are converted; results are clamped to bounds and rounded
 * for ints. Booleans reuse {@link coerceParamValueToBoolean}. Object/array
 * values pass through untouched.
 */
export function coerceParamValueForDataType(
  value: unknown,
  dataType: ResolvedParamDataType,
  bounds?: Record<string, any>,
): unknown {
  switch (dataType) {
    case "bool":
      return coerceParamValueToBoolean(value);

    case "int":
    case "float": {
      const fallback = typeof bounds?.min === "number" ? bounds.min : 0;
      let num: number;
      if (typeof value === "number") {
        num = value;
      } else if (typeof value === "boolean") {
        num = value ? 1 : 0;
      } else if (typeof value === "string" && value.trim() !== "") {
        num = Number(value.trim());
      } else {
        num = fallback;
      }
      if (!Number.isFinite(num)) {
        num = fallback;
      }
      if (typeof bounds?.min === "number" && num < bounds.min) num = bounds.min;
      if (typeof bounds?.max === "number" && num > bounds.max) num = bounds.max;
      if (dataType === "int") num = Math.round(num);
      return num;
    }

    case "object":
    case "array":
      return value;

    case "string":
    default: {
      if (value == null) return "";
      // Structured values under a string-typed param are passed through
      // rather than stringified to "[object Object]".
      if (typeof value === "object") return value;
      return typeof value === "string" ? value : String(value);
    }
  }
}

/**
 * Resolves a param's effective type and coerces `value` for write.
 * Single entry point used by the schedule/automation validation layer.
 */
export function sanitizeWritableParamValue(
  param: ParamTypeMetadata,
  value: unknown,
): { dataType: ResolvedParamDataType; value: unknown } {
  const dataType = resolveParamDataType(param);
  return { dataType, value: coerceParamValueForDataType(value, dataType, param.bounds) };
}

/**
 * Handles default writable param value logic for this module.
 * Numeric params default to the lower bound rather than 0, so untouched
 * sliders with non-zero minimums (e.g. CCT, min 2700) save an in-range value.
 */
export function defaultWritableParamValue(param: ESPCDFDeviceParam): unknown {
  const resolved = resolveParamDataType(param);
  switch (resolved) {
    case "int":
    case "float": {
      const min = param.bounds?.min;
      return typeof min === "number" ? min : 0;
    }
    case "bool":
      return false;
    default:
      return "";
  }
}

/**
 * Filters out parameters with excluded types (name and hidden parameters)
 * @param params - Array of device parameters to filter
 * @returns Filtered array excluding name and hidden parameters
 */
export const filterExcludedParamTypes = (
  params?: ESPCDFDeviceParam[]
): ESPCDFDeviceParam[] | undefined => {
  if (!params) return undefined;
  return params.filter(
    (param) =>
      ![ESPRM_NAME_PARAM_TYPE, ESPRM_UI_HIDDEN_PARAM_TYPE].includes(
        param.type ?? "",
      ),
  );
};

// --- Param bounds (cross-SDK; set by adaptors on `param.bounds`) ---

/** Bounds key: current state value → control-board action for play/pause controls. */
export const PARAM_BOUNDS_CONTROL_BOARD_ACTIONS = "controlBoardActions";
/** Bounds key: suffix appended to displayed values (e.g. `%`). */
export const PARAM_BOUNDS_VALUE_SUFFIX = "valueSuffix";
/** Bounds key: hide the param row when `value` equals this string. */
export const PARAM_BOUNDS_HIDE_WHEN_VALUE = "hideWhenValue";
/** Bounds key: write is action-button/command only — do not update local UI state. */
export const PARAM_BOUNDS_ACTION_BUTTON_ONLY = "actionButtonOnly";
/**
 * Bounds key: disable the param when a sibling param on the same device
 * holds a value listed in `values`. Used e.g. on RVC `Go Home` so the
 * button is inert while `Run Mode` is `idle` (device is already at base /
 * not roaming) without baking RVC-specific state into a generic component.
 */
export const PARAM_BOUNDS_DISABLED_WHEN_SIBLING_VALUE =
  "disabledWhenSiblingValue";

/** Icon tokens for {@link ParamControlBoardActionSpec} (transport play/pause or lock/unlock). */
export type ParamControlBoardIcon =
  | "play"
  | "pause"
  | "lock"
  | "unlock";

/** One state → action mapping for control-board params. */
export type ParamControlBoardActionSpec = {
  action: string;
  label: string;
  icon: ParamControlBoardIcon;
};

/** Sibling-param gate spec for {@link PARAM_BOUNDS_DISABLED_WHEN_SIBLING_VALUE}. */
export type ParamDisabledWhenSiblingValue = {
  /** Sibling param `name` on the same device. */
  paramName: string;
  /** Sibling values (matched as strings) that disable this param. */
  values: string[];
};

/** Typed subset of CDF `param.bounds` used by ParamControls. */
export type ParamControlBounds = {
  validStrings?: string[];
  labels?: Record<string, string>;
  rawModes?: Record<string, number>;
  [PARAM_BOUNDS_CONTROL_BOARD_ACTIONS]?: Record<string, ParamControlBoardActionSpec>;
  [PARAM_BOUNDS_VALUE_SUFFIX]?: string;
  [PARAM_BOUNDS_HIDE_WHEN_VALUE]?: string;
  [PARAM_BOUNDS_ACTION_BUTTON_ONLY]?: boolean;
  [PARAM_BOUNDS_DISABLED_WHEN_SIBLING_VALUE]?: ParamDisabledWhenSiblingValue;
};

/**
 * Reads typed bounds from a device param.
 * @param param - Device param with optional `bounds`.
 * @returns Parsed bounds object.
 */
export function getParamControlBounds(
  param: ESPCDFDeviceParam,
): ParamControlBounds {
  return (param.bounds ?? {}) as ParamControlBounds;
}

/**
 * Resolves the control-board action for the current state value.
 * @param stateValue - Current param display value (state slug).
 * @param controlBoardActions - Map from state slug to action spec.
 * @returns Action spec or `null` when the state has no control.
 */
export function resolveControlBoard(
  stateValue: unknown,
  controlBoardActions: Record<string, ParamControlBoardActionSpec> | undefined,
): ParamControlBoardActionSpec | null {
  if (!controlBoardActions) {
    return null;
  }
  return controlBoardActions[String(stateValue ?? "")] ?? null;
}

/**
 * Returns whether a param row should be hidden based on bounds metadata.
 * @param param - Device param to evaluate.
 * @returns `true` when the param should not render.
 */
export function shouldHideParamRow(param: ESPCDFDeviceParam): boolean {
  const bounds = getParamControlBounds(param);
  const hideWhen = bounds[PARAM_BOUNDS_HIDE_WHEN_VALUE];
  if (!hideWhen) {
    return false;
  }
  return String(param.value ?? "") === hideWhen;
}

/**
 * Returns whether a param should be rendered disabled because a sibling
 * param on the same device holds a value listed in
 * {@link PARAM_BOUNDS_DISABLED_WHEN_SIBLING_VALUE}.
 * @param param - Device param being rendered.
 * @param siblingParams - All params on the same device (including `param`).
 * @returns `true` when a configured sibling currently matches a disable value.
 */
export function isParamDisabledBySibling(
  param: ESPCDFDeviceParam,
  siblingParams: readonly ESPCDFDeviceParam[],
): boolean {
  const bounds = getParamControlBounds(param);
  const rule = bounds[PARAM_BOUNDS_DISABLED_WHEN_SIBLING_VALUE];
  if (!rule || !rule.paramName || !Array.isArray(rule.values)) {
    return false;
  }
  const sibling = siblingParams.find((p) => p.name === rule.paramName);
  if (!sibling) {
    return false;
  }
  return rule.values.includes(String(sibling.value ?? ""));
}

/**
 * Returns whether a write should persist without updating local UI state.
 * @param param - Device param being written.
 * @param newValue - Proposed write value from the control.
 * @returns `true` when local state should be left unchanged.
 */
export function shouldPersistWriteWithoutLocalUpdate(
  param: ESPCDFDeviceParam,
  newValue: unknown,
): boolean {
  const bounds = getParamControlBounds(param);
  if (
    bounds[PARAM_BOUNDS_ACTION_BUTTON_ONLY] === true &&
    newValue === PARAM_CONTROL_INVOKE_VALUE
  ) {
    return true;
  }
  const controlBoardActions = bounds[PARAM_BOUNDS_CONTROL_BOARD_ACTIONS];
  if (
    controlBoardActions &&
    typeof newValue === "string" &&
    Array.isArray(bounds.validStrings) &&
    bounds.validStrings.includes(newValue)
  ) {
    return true;
  }
  return false;
}

/**
 * Returns whether a displayed value should be treated as unknown/empty.
 * @param value - Raw param value.
 * @returns `true` when no meaningful value is available.
 */
export function isUnknownParamValue(value: unknown): boolean {
  const raw = value == null ? "" : String(value);
  return raw === PARAM_VALUE_UNKNOWN || raw.length === 0;
}
