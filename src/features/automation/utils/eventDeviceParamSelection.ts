/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFAutomationNodeParamsEvent } from "@store";
import { ESPCDFAutomationConditionOperator } from "@store";
import {
  resolveParamDataType,
  type ParamTypeMetadata,
} from "@shared/utils/paramUtils";

export interface EventConditionOption {
  label: string;
  value: ESPCDFAutomationConditionOperator;
  isVisible?: boolean;
}

/**
 * Returns the first draft event when it is a node-params trigger for the given device.
 * @param events - Automation context `state.events`
 * @param deviceName - Logical device name on the event node
 * @returns The node-params event or null
 */
export function getNodeParamsEventForDevice(
  events: readonly unknown[] | undefined,
  deviceName: string | undefined,
): ESPCDFAutomationNodeParamsEvent | null {
  if (!deviceName || !events?.length) return null;
  const event = events[0];
  if (typeof event !== "object" || event === null) return null;
  if (
    !("deviceName" in event) ||
    !("param" in event) ||
    !("check" in event) ||
    !("value" in event)
  ) {
    return null;
  }
  const nodeParams = event as ESPCDFAutomationNodeParamsEvent;
  return nodeParams.deviceName === deviceName ? nodeParams : null;
}

/**
 * Returns available condition options for event parameter (non-bool, non-string show all operators).
 * Pure; no side effects.
 */
export function getAvailableEventConditions(): EventConditionOption[] {
  return [
    { label: "==", value: ESPCDFAutomationConditionOperator.EQUAL, isVisible: true },
    { label: ">", value: ESPCDFAutomationConditionOperator.GREATER_THAN, isVisible: true },
    { label: "<", value: ESPCDFAutomationConditionOperator.LESS_THAN, isVisible: true },
    { label: "!=", value: ESPCDFAutomationConditionOperator.NOT_EQUAL },
    { label: ">=", value: ESPCDFAutomationConditionOperator.GREATER_THAN_OR_EQUAL },
    { label: "<=", value: ESPCDFAutomationConditionOperator.LESS_THAN_OR_EQUAL },
  ];
}

/**
 * Whether the parameter should show the condition selector (numeric types).
 * Bool and string use only EQUAL in UI.
 *
 * Resolves the effective data type (normalized declared type, with bool-label
 * and value-type fallbacks) instead of string-matching `dataType` directly.
 * Shows the selector only for int/float, which also keeps object/array params
 * on EQUAL — matching the firmware's eq/ne restriction for those types.
 */
export function shouldShowConditionSelector(param: ParamTypeMetadata): boolean {
  const dataType = resolveParamDataType(param);
  return dataType === "int" || dataType === "float";
}
