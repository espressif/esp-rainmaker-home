/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { PARAM_CONTROLS } from "@/config/params.config";
import {
  findCompoundMatch,
  type ParamControlConfig,
} from "@shared/utils/deviceParams";
import type { ESPCDFDeviceParam } from "@store";
import type { DeviceParamGroup } from "@src/types/global";
import { isIdentifyParam } from "@shared/utils/deviceIdentify";
import {
  ESPRM_CCT_PARAM_TYPE,
  ESPRM_HUE_PARAM_TYPE,
  ESPRM_NAME_PARAM_TYPE,
  ESPRM_POWER_PARAM_TYPE,
  ESPRM_SATURATION_PARAM_TYPE,
  ESPRM_UI_CCT_SLIDER_PARAM_TYPE,
  ESPRM_UI_HIDDEN_PARAM_TYPE,
  ESPRM_UI_HUE_CIRCLE_PARAM_TYPE,
  ESPRM_UI_HUE_SLIDER_PARAM_TYPE,
  ESPRM_UI_PUSH_BUTTON_PARAM_TYPE,
  ESPRM_UI_TOGGLE_PARAM_TYPE,
  PARAM_CONTROL_INVOKE_VALUE,
  PARAM_VALUE_UNKNOWN,
} from "./constants";
import {
  MATTER_COLOR_ATTRIBUTE_COLOR_TEMPERATURE_MIREDS,
  MATTER_COLOR_ATTRIBUTE_CURRENT_HUE,
  MATTER_COLOR_ATTRIBUTE_CURRENT_SATURATION,
  MATTER_COLOR_ATTRIBUTE_CURRENT_X,
  MATTER_COLOR_ATTRIBUTE_CURRENT_Y,
} from "./matterParamConstants";

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
  // Compound rules are more specific than either flat lookup below.
  const compound = findCompoundMatch(param);
  if (compound?.control) {
    return compound.control as any;
  }
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
 * Maps each declared `type`/`uiType` to the role of the entry owning it;
 * entries without a `paramType` contribute nothing, so a generic control
 * never shadows a specific one.
 * @returns Lookup from type or uiType to canonical role
 */
const buildParamRoleMap = (): Record<string, string> =>
  (PARAM_CONTROLS as ParamControlConfig[]).reduce((acc, control) => {
    if (!control.paramType) return acc;
    control.types.forEach((type) => {
      acc[type] = control.paramType as string;
    });
    return acc;
  }, {} as Record<string, string>);

// `PARAM_CONTROLS` is static, so the map is built once instead of per lookup
// (observer panels call `getParamRole` several times per render).
let cachedParamRoleMap: Record<string, string> | undefined;
const getParamRoleMap = (): Record<string, string> =>
  (cachedParamRoleMap ??= buildParamRoleMap());

/**
 * Canonical role of a param as declared by `params.config`, so a screen can
 * ask what a param is without knowing which stack produced it.
 * @param param - The device parameter
 * @param roleMap - Optional pre-computed role map (for performance)
 * @returns The declared role, or undefined when the param has none
 */
export const getParamRole = (
  param: ESPCDFDeviceParam,
  roleMap?: Record<string, string>
): string | undefined => {
  const compound = findCompoundMatch(param);
  if (compound?.paramType) {
    return compound.paramType;
  }
  const map = roleMap || getParamRoleMap();
  return map[param.uiType ?? ""] ?? map[param.type ?? ""];
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
 * RainMaker Neo/cloud config omits or mislabels `dataType` (e.g. Power ends up as "string").
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
 * Normalizes the declared `dataType` (rainmaker-neo-base-sdk >= 1.2.1 delivers it
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
 * Filters out params that must never appear in schedule / automation pickers.
 *
 * `identify` is a momentary Matter passthrough — writing seconds blinks the
 * device *now* — so it is meaningless on a timer. FW will not mark it
 * `esp.ui.hidden`, so this list is the only thing hiding it: keep the entry.
 * @param params - Array of device parameters to filter
 * @returns Filtered array excluding name, hidden and identify params
 */
export const filterExcludedParamTypes = (
  params?: ESPCDFDeviceParam[]
): ESPCDFDeviceParam[] | undefined => {
  if (!params) return undefined;
  return params.filter((param) => {
    // A uiType, so check it there too — `type` alone missed FW-hidden params.
    if (
      param.uiType === ESPRM_UI_HIDDEN_PARAM_TYPE ||
      param.type === ESPRM_UI_HIDDEN_PARAM_TYPE
    ) {
      return false;
    }
    if (isIdentifyParam(param)) {
      return false;
    }
    return (param.type ?? "").trim() !== ESPRM_NAME_PARAM_TYPE;
  });
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
  validValues?: ParamValueLabel[];
  unit?: string;
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

// --- Param schema: declared unit and enumerated values ---
//
// Two optional schema fields a param may carry:
//
//   "unit": "celsius"                       — a machine token, never a symbol
//   "valid_values": [{ "value": 2, "label": "Jammed" }, ...]
//
// `value` is the param's own value (int / string / bool); `label` is what the
// user sees. `valid_strs: ["Off","Auto"]` is the compact spelling of the case
// where value === label, so it is normalized into the same shape here and the
// controls keep one renderer. `bounds` still describes the numeric domain —
// both may appear on one param (a fan speed is ordinal *and* labelled). Both
// fields are optional: a param declaring neither renders exactly as before.

/** One enumerated value a param can take, with the text shown for it. */
export type ParamValueLabel = {
  /** The param's own value, as written on the wire (int / string / bool). */
  value: string | number | boolean;
  /** Display text for that value. */
  label: string;
};

/**
 * Reads an optional schema field from a param across the carriers the
 * different stacks use, most specific first: the CDF param itself, the
 * underlying SDK param it wraps (`_raw`, where RMNeo keeps `validStrings`),
 * and the open `bounds` bag the Matter adaptors compile enum config into.
 * Snake-case is accepted alongside camelCase so a raw node-config param works
 * untransformed.
 * @param param - Device param to read from.
 * @param camelKey - Field name as the SDKs expose it.
 * @param snakeKey - Field name as the node config spells it.
 * @returns First defined value found, or `undefined`.
 */
function readParamSchemaField(
  param: ESPCDFDeviceParam | undefined,
  camelKey: string,
  snakeKey: string,
): unknown {
  const carriers: unknown[] = [
    param,
    (param as unknown as { _raw?: unknown } | undefined)?._raw,
    param?.bounds,
  ];
  for (const carrier of carriers) {
    if (!carrier || typeof carrier !== "object") continue;
    const record = carrier as Record<string, unknown>;
    if (record[camelKey] !== undefined) return record[camelKey];
    if (record[snakeKey] !== undefined) return record[snakeKey];
  }
  return undefined;
}

/**
 * Canonical unit token a param declares, e.g. `"celsius"`.
 * The token stays a token here; `resolveParamUnitSymbol` in `./paramUnits`
 * owns the symbol, so the wire value never reaches the screen unmapped.
 * @param param - Device param to read.
 * @returns Declared unit token, or `undefined` when the param declares none.
 */
export function resolveParamUnit(
  param: ESPCDFDeviceParam,
): string | undefined {
  const declared = readParamSchemaField(param, "unit", "unit");
  if (typeof declared !== "string") return undefined;
  const token = declared.trim();
  return token.length > 0 ? token : undefined;
}

/**
 * Normalizes one wire entry into a {@link ParamValueLabel}.
 * @param entry - Raw `valid_values` element.
 * @returns Normalized pair, or `null` when the entry carries no usable value.
 */
function toParamValueLabel(entry: unknown): ParamValueLabel | null {
  if (!entry || typeof entry !== "object") return null;
  const { value, label } = entry as { value?: unknown; label?: unknown };
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    return null;
  }
  const text =
    typeof label === "string" && label.trim().length > 0
      ? label
      : String(value);
  return { value, label: text };
}

/**
 * The param's enumerated values in declared order, with `valid_strs` folded
 * into the same `{value, label}` shape so controls see one source.
 *
 * An entry whose label is just its value carries no display text of its own —
 * every `valid_strs` entry is like this by construction — so an
 * adaptor-compiled `bounds.labels` entry is used for it where one exists. That
 * keeps `["idle","docked"]` + `labels` rendering as "Idle" / "Docked" rather
 * than regressing to the raw slugs, while a label the device itself declared
 * is always left as it is.
 * @param param - Device param to read.
 * @returns Enumerated values, or `undefined` when the value set is not enumerable.
 */
export function resolveParamValidValues(
  param: ESPCDFDeviceParam,
): ParamValueLabel[] | undefined {
  const enumerated = readParamEnumeratedValues(param);
  if (!enumerated) return undefined;

  const fallbackLabels = getParamControlBounds(param).labels;
  if (!fallbackLabels) return enumerated;

  return enumerated.map((entry) => {
    if (entry.label !== String(entry.value)) return entry;
    const mapped = fallbackLabels[String(entry.value)];
    return mapped ? { ...entry, label: mapped } : entry;
  });
}

/**
 * Reads the enumerated values exactly as the param declares them, preferring
 * `valid_values` over the compact `valid_strs` spelling.
 * @param param - Device param to read.
 * @returns Enumerated values, or `undefined` when none are declared.
 */
function readParamEnumeratedValues(
  param: ESPCDFDeviceParam,
): ParamValueLabel[] | undefined {
  const declared = readParamSchemaField(param, "validValues", "valid_values");
  if (Array.isArray(declared)) {
    const normalized = declared
      .map(toParamValueLabel)
      .filter((entry): entry is ParamValueLabel => entry !== null);
    if (normalized.length > 0) return normalized;
  }

  const strings = readParamSchemaField(param, "validStrings", "valid_strs");
  if (Array.isArray(strings)) {
    const normalized = strings
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => ({ value: entry, label: entry }));
    if (normalized.length > 0) return normalized;
  }

  return undefined;
}

/**
 * Indexes display labels by stringified value, for controls that already take
 * a `labels` map (status readouts, indexed level sliders).
 * @param validValues - Normalized enumerated values.
 * @returns Value → label map, or `undefined` when there is nothing to index.
 */
export function paramValueLabelMap(
  validValues: ParamValueLabel[] | undefined,
): Record<string, string> | undefined {
  if (!validValues?.length) return undefined;
  return Object.fromEntries(
    validValues.map((entry) => [String(entry.value), entry.label]),
  );
}

/** Display metadata handed to every param control, assembled in one place. */
export type ParamControlMeta = ParamControlBounds &
  Record<string, unknown> & {
    dataType?: string;
    unit?: string;
    validValues?: ParamValueLabel[];
    labels?: Record<string, string>;
  };

/**
 * Builds the `meta` every param control receives.
 *
 * The single normalization point: `valid_strs` becomes `valid_values`, those
 * labels are indexed into the `labels` map the readouts and indexed sliders
 * already consume, and the declared unit token is carried through for the
 * controls that render a suffix. A label the device declared for a value wins
 * over an adaptor-compiled `bounds.labels` entry, since the config is the
 * authoritative, self-describing source; where the device declared no display
 * text, {@link resolveParamValidValues} has already adopted the adaptor's.
 * @param param - Device param being rendered.
 * @returns Metadata object passed to controls as `meta`.
 */
export function buildParamControlMeta(
  param: ESPCDFDeviceParam,
): ParamControlMeta {
  const bounds = getParamControlBounds(param);
  const validValues = resolveParamValidValues(param);
  const declaredLabels = paramValueLabelMap(validValues);

  return {
    ...bounds,
    dataType: param.dataType,
    unit: resolveParamUnit(param),
    validValues,
    labels: declaredLabels
      ? { ...bounds.labels, ...declaredLabels }
      : bounds.labels,
    [PARAM_BOUNDS_VALUE_SUFFIX]: bounds[PARAM_BOUNDS_VALUE_SUFFIX] ?? "",
    [PARAM_BOUNDS_CONTROL_BOARD_ACTIONS]:
      bounds[PARAM_BOUNDS_CONTROL_BOARD_ACTIONS],
  };
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

/** Cluster id key for Color Control, as it appears in endpoint metadata. */
const MATTER_COLOR_CONTROL_CLUSTER_KEYS = ["0x300", "0x0300"] as const;

/**
 * Marker field set on Hue/Saturation params that are driven through CIE XY
 * (`CurrentX`/`CurrentY` + `MoveToColor`) rather than the HS attributes —
 * synthesized by the Matter adaptor for XY-only color lights. The color
 * support filter below keeps such params when the XY attribute pair is
 * advertised, where an HS-backed param would be dropped.
 */
export const MATTER_XY_COLOR_PARAM_FLAG = "matterXyColor";

/** Whether a param is an XY-driven color param (see {@link MATTER_XY_COLOR_PARAM_FLAG}). */
export function isMatterXyColorParam(param: ESPCDFDeviceParam): boolean {
  if (
    (param as unknown as Record<string, unknown>)[
      MATTER_XY_COLOR_PARAM_FLAG
    ] === true
  ) {
    return true;
  }
  // Classic stack: the CDF param wraps the SDK's ESPRMMatterDeviceParam in
  // `_raw`, which carries the XY marker as `xyColorComponent` (Neo stamps the
  // flag above during its Matter decoration instead).
  return (
    (param as unknown as { _raw?: { xyColorComponent?: unknown } })._raw
      ?.xyColorComponent !== undefined
  );
}

/** Reads Color Control (0x300) attribute ids from persisted `matter_data.endpoints`. */
function readColorAttributesFromMatterDataEndpoints(
  endpoints: Record<string, unknown>,
): Set<number> {
  const attributes = new Set<number>();
  for (const epData of Object.values(endpoints)) {
    if (!epData || typeof epData !== "object") continue;
    const epRecord = epData as Record<string, unknown>;
    const clusters =
      (epRecord.clusters as Record<string, unknown> | undefined) ??
      (epRecord.c as Record<string, unknown> | undefined);
    if (!clusters || typeof clusters !== "object") continue;

    const servers =
      (clusters.servers as Record<string, unknown> | undefined) ??
      (clusters.s as Record<string, unknown> | undefined) ??
      clusters;
    if (!servers || typeof servers !== "object") continue;

    for (const key of MATTER_COLOR_CONTROL_CLUSTER_KEYS) {
      const colorCluster = servers[key];
      if (!colorCluster || typeof colorCluster !== "object") continue;
      const attrSection =
        (colorCluster as { attributes?: unknown; a?: unknown }).attributes ??
        (colorCluster as { attributes?: unknown; a?: unknown }).a;
      if (Array.isArray(attrSection)) {
        for (const raw of attrSection) {
          const id = typeof raw === "number" ? raw : Number.parseInt(String(raw), 16);
          if (Number.isFinite(id)) attributes.add(id);
        }
      } else if (attrSection && typeof attrSection === "object") {
        for (const attrKey of Object.keys(attrSection as Record<string, unknown>)) {
          const id = Number.parseInt(attrKey, 16);
          if (Number.isFinite(id)) attributes.add(id);
        }
      }
    }
  }
  return attributes;
}

function collectColorAttributesFromEspEndpoints(
  endpoints: Record<string, unknown>,
): Set<number> {
  const attributes = new Set<number>();
  for (const endpoint of Object.values(endpoints)) {
    const clusters = (endpoint as { clusters?: Record<string, unknown> })?.clusters;
    if (!clusters || typeof clusters !== "object") continue;
    const servers = ((clusters as { servers?: Record<string, unknown> }).servers ??
      clusters) as Record<string, unknown>;

    let colorCluster: unknown;
    for (const key of MATTER_COLOR_CONTROL_CLUSTER_KEYS) {
      if (servers[key]) {
        colorCluster = servers[key];
        break;
      }
    }
    const attrList = (colorCluster as { attributes?: unknown })?.attributes;
    if (Array.isArray(attrList)) {
      for (const raw of attrList) {
        const id = typeof raw === "number" ? raw : Number.parseInt(String(raw), 16);
        if (Number.isFinite(id)) attributes.add(id);
      }
    }
  }
  return attributes;
}

/** Reads the set of Color Control (0x300) attribute ids the node advertises, unioned across endpoints, or `null` when none are advertised. */
function readAdvertisedMatterColorAttributes(
  node: { metadata?: unknown } | null | undefined,
): Set<number> | null {
  const metadata = node?.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const meta = metadata as Record<string, unknown>;

  const matterData = meta.matter_data as { endpoints?: Record<string, unknown> } | undefined;
  if (matterData?.endpoints && typeof matterData.endpoints === "object") {
    const fromPersisted = readColorAttributesFromMatterDataEndpoints(matterData.endpoints);
    if (fromPersisted.size > 0) return fromPersisted;
  }

  const matter = (meta.Matter ?? meta.matter) as { endpoints?: Record<string, unknown> } | undefined;
  const endpoints = matter?.endpoints;
  if (!endpoints || typeof endpoints !== "object") return null;

  const attributes = collectColorAttributesFromEspEndpoints(endpoints);
  return attributes.size > 0 ? attributes : null;
}

/** Maps a color param to its backing Color Control (0x300) attribute id, or `null` for non-color params. */
function matterColorParamBackingAttribute(
  param: ESPCDFDeviceParam,
): number | null {
  const uiType = param.uiType ?? "";
  const type = param.type ?? "";
  const name = String(param.name ?? "").trim().toLowerCase();

  if (
    uiType === ESPRM_UI_HUE_SLIDER_PARAM_TYPE ||
    uiType === ESPRM_UI_HUE_CIRCLE_PARAM_TYPE ||
    type === ESPRM_HUE_PARAM_TYPE ||
    name === "hue"
  ) {
    return MATTER_COLOR_ATTRIBUTE_CURRENT_HUE;
  }
  if (type === ESPRM_SATURATION_PARAM_TYPE || name === "saturation") {
    return MATTER_COLOR_ATTRIBUTE_CURRENT_SATURATION;
  }
  if (
    uiType === ESPRM_UI_CCT_SLIDER_PARAM_TYPE ||
    type === ESPRM_CCT_PARAM_TYPE ||
    name === "cct" ||
    name === "colortemperature"
  ) {
    return MATTER_COLOR_ATTRIBUTE_COLOR_TEMPERATURE_MIREDS;
  }
  return null;
}

/** Drops Matter color params (Hue / Saturation / CCT) the device cannot actually back. */
export function filterUnsupportedMatterColorParams<T extends ESPCDFDeviceParam>(
  node: { metadata?: unknown } | null | undefined,
  params: T[],
): T[] {
  if (!params || params.length === 0) return params;
  const advertised = readAdvertisedMatterColorAttributes(node);
  if (!advertised) return params;
  return params.filter((param) => {
    const backingAttribute = matterColorParamBackingAttribute(param);
    if (backingAttribute === null) return true;
    if (advertised.has(backingAttribute)) return true;
    // XY-driven Hue/Saturation params are backed by the CurrentX/CurrentY
    // pair instead of the HS attributes they are named after.
    if (
      isMatterXyColorParam(param) &&
      (backingAttribute === MATTER_COLOR_ATTRIBUTE_CURRENT_HUE ||
        backingAttribute === MATTER_COLOR_ATTRIBUTE_CURRENT_SATURATION)
    ) {
      return (
        advertised.has(MATTER_COLOR_ATTRIBUTE_CURRENT_X) &&
        advertised.has(MATTER_COLOR_ATTRIBUTE_CURRENT_Y)
      );
    }
    return false;
  });
}
