/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Validation layer for schedule/automation payloads.
 *
 * Firmware parses schedule actions and automation triggers strictly by type:
 * a numeric param sent as `""` produces `{"Brightness": ""}` (schedule no-op)
 * or "Failed to parse expected value" (automation), and a single malformed
 * trigger makes the firmware drop ALL triggers on the node. Every value is
 * therefore resolved against the device param metadata in the store and
 * coerced to its wire type before anything is sent. Coercion is best-effort
 * and never blocks a save: values that cannot be parsed fall back to the
 * param's typed default (lower bound or 0 for numeric, false for bool).
 *
 * The original source of bad values — params losing `data_type` on the
 * node-config cache round trip — is fixed in rmng-base-sdk 1.2.1. This layer
 * remains for payloads that fix cannot reach: schedules/automations already
 * stored in the cloud with `""` values, repaired here on the next save/sync.
 */

import type { ESPCDFAutomationAction, ESPCDFDeviceParam } from "@store";
import { sanitizeWritableParamValue } from "./paramUtils";

/** Resolves a device param's metadata from the store; undefined when unknown. */
export type ParamLookup = (
  nodeId: string,
  deviceName: string,
  paramName: string,
) => ESPCDFDeviceParam | undefined;

/** Minimal node-store shape needed to look up device params. */
type NodeStoreLike = {
  nodesByIDMap?: Record<
    string,
    { devices?: { name?: string; params?: ESPCDFDeviceParam[] }[] } | undefined
  >;
};

/**
 * Builds a {@link ParamLookup} over the CDF node store.
 * @param nodeStore - `store.nodeStore` from `useCDF`.
 */
export function createStoreParamLookup(nodeStore: NodeStoreLike): ParamLookup {
  return (nodeId, deviceName, paramName) => {
    const node = nodeStore?.nodesByIDMap?.[nodeId];
    const device = node?.devices?.find((d) => d.name === deviceName);
    return device?.params?.find((p) => p.name === paramName);
  };
}

/**
 * Sanitizes one device action value against store metadata. When the param is
 * unknown (node removed, param renamed), the value passes through unchanged.
 */
function sanitizeActionValue(
  lookup: ParamLookup,
  nodeId: string,
  deviceName: string,
  paramName: string,
  value: unknown,
): unknown {
  const param = lookup(nodeId, deviceName, paramName);
  if (!param) {
    return value;
  }
  return sanitizeWritableParamValue(param, value).value;
}

/** Nested schedule/automation action map: nodeId → device → param → value. */
export type DeviceActionsMap = Record<
  string,
  Record<string, Record<string, unknown>>
>;

/**
 * Sanitizes a nested action map (used by schedules and the automation
 * builder context) so every param value matches the firmware wire type.
 */
export function sanitizeDeviceActionsMap(
  actions: DeviceActionsMap | undefined,
  lookup: ParamLookup,
): DeviceActionsMap {
  const sanitized: DeviceActionsMap = {};

  Object.entries(actions ?? {}).forEach(([nodeId, deviceActions]) => {
    sanitized[nodeId] = {};
    Object.entries(deviceActions ?? {}).forEach(([deviceName, paramValues]) => {
      sanitized[nodeId][deviceName] = {};
      Object.entries(paramValues ?? {}).forEach(([paramName, value]) => {
        sanitized[nodeId][deviceName][paramName] = sanitizeActionValue(
          lookup,
          nodeId,
          deviceName,
          paramName,
          value,
        );
      });
    });
  });

  return sanitized;
}

/**
 * Sanitizes flat automation actions (`{ nodeId, deviceName, param, value }`)
 * before they are converted to RainMaker Neo action targets.
 */
export function sanitizeAutomationActions(
  actions: ESPCDFAutomationAction[],
  lookup: ParamLookup,
): ESPCDFAutomationAction[] {
  return actions.map((action) => ({
    ...action,
    value: sanitizeActionValue(
      lookup,
      action.nodeId,
      action.deviceName,
      action.param,
      action.value,
    ),
  }));
}

/** CDF ordering operators; firmware only accepts ordering compares for int/float params. */
const ORDERING_OPERATORS: readonly string[] = ["<", "<=", ">", ">="];

/** CDF operator whose wire compare (eq) the firmware accepts for every value type. */
const EQUAL_OPERATOR = "==";

/** Node-params automation event shape (deviceName/param/check/value). */
type NodeParamsEventLike = {
  deviceName?: string;
  param?: string;
  check?: string;
  value?: unknown;
};

const isNodeParamsEvent = (event: unknown): event is Required<NodeParamsEventLike> =>
  typeof event === "object" &&
  event !== null &&
  "deviceName" in event &&
  "param" in event &&
  "check" in event &&
  "value" in event;

/**
 * Sanitizes automation trigger events for a node so the firmware can always
 * parse them (one bad trigger disables ALL triggers on the node).
 *
 * Node-params events get their value coerced to the param wire type — this
 * repairs legacy triggers stored with `""` values. An ordering operator
 * (>, <=, ...) on a non-numeric param can never parse on the firmware, so it
 * falls back to `==`, the only compare accepted for every type. Weather and
 * daylight events pass through untouched.
 */
export function sanitizeAutomationEvents<T>(
  events: T[],
  nodeId: string,
  lookup: ParamLookup,
): T[] {
  return events.map((event) => {
    if (!isNodeParamsEvent(event)) return event;

    const param = lookup(nodeId, event.deviceName, event.param);
    if (!param) return event;

    const { dataType, value } = sanitizeWritableParamValue(param, event.value);
    const isNumeric = dataType === "int" || dataType === "float";
    if (!isNumeric && ORDERING_OPERATORS.includes(event.check)) {
      return { ...event, check: EQUAL_OPERATOR, value } as T;
    }
    return { ...event, value } as T;
  });
}
