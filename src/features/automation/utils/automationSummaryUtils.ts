/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TFunction } from "i18next";
import type { ESPCDFAutomation } from "@store";
import { ESPCDFAutomationConditionOperator } from "@store";
import { getValueDisplay } from "@shared/utils/automationConditionUtils";
import {
  AUTOMATION_CONDITION_SYMBOL_EQUAL,
  AUTOMATION_CONDITION_SYMBOL_GREATER_THAN,
  AUTOMATION_CONDITION_SYMBOL_GREATER_THAN_OR_EQUAL,
  AUTOMATION_CONDITION_SYMBOL_LESS_THAN,
  AUTOMATION_CONDITION_SYMBOL_LESS_THAN_OR_EQUAL,
  AUTOMATION_CONDITION_SYMBOL_NOT_EQUAL,
} from "@shared/utils/constants";

/** Resolves a device display name from node + device identifiers. */
export type DeviceDisplayNameResolver = (
  nodeId: string,
  deviceName: string,
) => string;

export interface AutomationEventSummary {
  whenLabel: string;
  displayName: string;
  paramName: string;
  conditionLabel: string;
  valueDisplay: string;
}

/**
 * Maps an automation condition operator to the card When-tag symbol.
 * Display-only for the list card; does not change create/edit picker labels.
 * @param condition - Condition operator key or enum value
 * @returns Operator symbol for the card tag
 */
function getAutomationCardConditionSymbol(condition: string): string {
  switch (condition) {
    case ESPCDFAutomationConditionOperator.EQUAL:
      return AUTOMATION_CONDITION_SYMBOL_EQUAL;
    case ESPCDFAutomationConditionOperator.NOT_EQUAL:
      return AUTOMATION_CONDITION_SYMBOL_NOT_EQUAL;
    case ESPCDFAutomationConditionOperator.GREATER_THAN:
      return AUTOMATION_CONDITION_SYMBOL_GREATER_THAN;
    case ESPCDFAutomationConditionOperator.LESS_THAN:
      return AUTOMATION_CONDITION_SYMBOL_LESS_THAN;
    case ESPCDFAutomationConditionOperator.GREATER_THAN_OR_EQUAL:
      return AUTOMATION_CONDITION_SYMBOL_GREATER_THAN_OR_EQUAL;
    case ESPCDFAutomationConditionOperator.LESS_THAN_OR_EQUAL:
      return AUTOMATION_CONDITION_SYMBOL_LESS_THAN_OR_EQUAL;
    default:
      return condition;
  }
}

/**
 * Builds display parts for the first automation event (When + condition).
 * @param automation - Automation entity from the store
 * @param getDeviceDisplayName - Resolves node/device to a display name
 * @param t - i18n translate function
 * @returns Structured event summary, or null when no event exists
 */
export function getAutomationEventSummary(
  automation: ESPCDFAutomation,
  getDeviceDisplayName: DeviceDisplayNameResolver,
  t: TFunction,
): AutomationEventSummary | null {
  const event = automation.events[0] as
    | { deviceName?: string; param?: string; check?: string; value?: unknown }
    | undefined;

  if (!event) {
    return null;
  }

  const deviceName = event.deviceName || "Device";
  const displayName = automation.nodeId
    ? getDeviceDisplayName(automation.nodeId, deviceName)
    : deviceName;
  const paramName = event.param || "Parameter";
  const condition = event.check || AUTOMATION_CONDITION_SYMBOL_GREATER_THAN;
  const value = event.value !== undefined ? event.value : "?";

  return {
    whenLabel: t("automation.card.when"),
    displayName,
    paramName,
    conditionLabel: getAutomationCardConditionSymbol(condition),
    valueDisplay: getValueDisplay(value, t),
  };
}

/**
 * Formats action description text from automation actions.
 * @param automation - Automation entity from the store
 * @param getDeviceDisplayName - Resolves node/device to a display name
 * @param t - i18n translate function
 * @returns Human-readable action summary
 */
export function getAutomationActionDescription(
  automation: ESPCDFAutomation,
  getDeviceDisplayName: DeviceDisplayNameResolver,
  t: TFunction,
): string {
  if (!automation.actions || automation.actions.length === 0) {
    return t("automation.card.noActions");
  }

  if (automation.actions.length === 1) {
    const action = automation.actions[0];
    const deviceName = action.deviceName || "Device";
    const displayName = action.nodeId
      ? getDeviceDisplayName(action.nodeId, deviceName)
      : deviceName;
    const paramName = action.param || "Parameter";
    const value = action.value !== undefined ? action.value : "?";
    const displayValue =
      typeof value === "boolean"
        ? value
          ? t("automation.card.on")
          : t("automation.card.off")
        : value;

    return `${displayName}: ${paramName}: ${displayValue}`;
  }

  const deviceGroups = new Map<string, typeof automation.actions>();

  automation.actions.forEach((action) => {
    const deviceKey = `${action.nodeId}-${action.deviceName}`;
    if (!deviceGroups.has(deviceKey)) {
      deviceGroups.set(deviceKey, []);
    }
    deviceGroups.get(deviceKey)!.push(action);
  });

  const uniqueDeviceCount = deviceGroups.size;
  const totalActions = automation.actions.length;

  if (uniqueDeviceCount === 1) {
    const deviceActions = Array.from(deviceGroups.values())[0];
    const deviceName = deviceActions[0].deviceName || "Device";
    const displayName = deviceActions[0].nodeId
      ? getDeviceDisplayName(deviceActions[0].nodeId, deviceName)
      : deviceName;

    const parameters = deviceActions
      .map((action) => {
        const paramName = action.param || "Parameter";
        const value = action.value !== undefined ? action.value : "?";
        const displayValue =
          typeof value === "boolean"
            ? value
              ? t("automation.card.on")
              : t("automation.card.off")
            : value;

        return `${paramName}: ${displayValue}`;
      })
      .join(", ");

    return `${displayName}: ${parameters}`;
  }

  return `${uniqueDeviceCount} ${t("automation.card.devices")} (${totalActions} ${t(
    "automation.card.actions",
  )})`;
}
