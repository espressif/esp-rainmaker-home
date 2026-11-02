/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFAutomation } from "@store";
import {
  getDeviceDisplayName,
  type NameSourceDevice,
  type NameSourceNode,
} from "@shared/utils/deviceDisplayName";

/** Shape for device-parameter event used in create automation UI */
export interface CreateAutomationEventInfo {
  deviceName: string;
  parameter: string;
  condition: string;
  value: unknown;
}

/** Shape for action card used in create automation UI */
export interface CreateAutomationActionCard {
  key: string;
  device: { type: string; name: string };
  displayDeviceName: string;
  actions: Record<string, unknown>;
}

/**
 * Filters automations to only those whose event nodeId is present in the current home's node list.
 * Pure function; no side effects.
 * @param automationsList - Full list of automations
 * @param nodeIds - Current home's node IDs
 * @returns Filtered list of automations visible in current home
 */
export function filterAutomationsByCurrentHomeNodes(
  automationsList: ESPCDFAutomation[] | null | undefined,
  nodeIds: string[]
): ESPCDFAutomation[] {
  if (!automationsList || automationsList.length === 0) {
    return [];
  }

  const currentHomeNodeIds = new Set(nodeIds);

  return automationsList.filter((automation) => {
    const nodeId = automation.nodeId;
    return nodeId != null && currentHomeNodeIds.has(nodeId);
  });
}

export type AutomationNameValidationError = "empty";

export interface ValidateAutomationNameResult {
  valid: boolean;
  errorKey?: AutomationNameValidationError;
}

/**
 * Validates automation name for creation (e.g. non-empty after trim).
 * Pure; no side effects.
 * @param name - Raw input name
 * @returns Validation result with optional error key for i18n
 */
export function validateAutomationName(
  name: string
): ValidateAutomationNameResult {
  const trimmed = name.trim();

  if (!trimmed) {
    return { valid: false, errorKey: "empty" };
  }

  return { valid: true };
}

/**
 * Extracts event info from automation events array for the first device-param event.
 * Pure; no side effects.
 */
export function getEventInfoFromEvents(
  events: unknown[]
): CreateAutomationEventInfo | null {
  if (!events || events.length === 0) return null;

  const event = events[0];
  if (
    typeof event === "object" &&
    event !== null &&
    "deviceName" in event &&
    "param" in event &&
    "check" in event &&
    "value" in event
  ) {
    const e = event as Record<string, unknown>;
    return {
      deviceName: String(e.deviceName),
      parameter: String(e.param),
      condition: String(e.check),
      value: e.value,
    };
  }
  return null;
}

/**
 * Returns whether the automation form state is valid (non-empty name, events, actions).
 * Pure; no side effects.
 */
export function isCreateAutomationValid(
  automationName: string,
  eventsCount: number,
  actionsKeysCount: number
): boolean {
  const hasValidName = Boolean(automationName?.trim());
  return (
    eventsCount > 0 &&
    actionsKeysCount > 0 &&
    hasValidName
  );
}

/** Minimal node shape for building action cards (avoids CDF dependency in util) */
export interface NodeForActionCard extends NameSourceNode {
  devices?: (NameSourceDevice & { name: string; type?: string })[];
}

/**
 * Builds action cards array from actions state and node map.
 * Only includes nodes in currentHomeNodeList. Pure; no side effects.
 */
export function getActionCardsFromActions(
  actions: Record<string, Record<string, Record<string, unknown>>>,
  currentHomeNodeList: string[],
  nodesByIDMap: Record<string, NodeForActionCard | undefined>
): CreateAutomationActionCard[] {
  const cards: CreateAutomationActionCard[] = [];
  const homeNodeSet = new Set(currentHomeNodeList);

  Object.entries(actions).forEach(([nodeId, deviceActions]) => {
    if (!homeNodeSet.has(nodeId)) return;

    const node = nodesByIDMap[nodeId];
    Object.entries(deviceActions).forEach(([deviceName, deviceParams]) => {
      const device = node?.devices?.find((d) => d.name === deviceName);
      cards.push({
        key: `${nodeId}-${deviceName}`,
        device: device
          ? { type: device.type ?? "switch", name: deviceName }
          : { type: "switch", name: deviceName },
        displayDeviceName: device
          ? getDeviceDisplayName(device, node)
          : deviceName,
        actions: (deviceParams ?? {}) as Record<string, unknown>,
      });
    });
  });

  return cards;
}
