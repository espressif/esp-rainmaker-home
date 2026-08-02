/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFNode } from "@store";
import { readMatterNodeIdFromCdfNode } from "./matterDeviceStateEvents";

/**
 * Sorts items by connectivity: connected first, then disconnected.
 * Pure; returns a new array without mutating the input.
 * @param items - Array to sort
 * @param getIsConnected - Returns true if the item is connected
 * @returns New sorted array
 */
export function sortByConnectivity<T>(
  items: T[],
  getIsConnected: (item: T) => boolean
): T[] {
  return [...items].sort((a, b) => {
    const aOnline = getIsConnected(a);
    const bOnline = getIsConnected(b);
    return aOnline === bOnline ? 0 : bOnline ? 1 : -1;
  });
}

/**
 * RainMaker automation cannot subscribe to local Matter-only triggers, so any
 * Matter-backed node is ineligible as an event/action device. Delegates to the
 * shared matter-node detector, which also checks the direct `node.matterNodeId`
 * field — pure-Matter nodes carry the id there rather than as a flat
 * `metadata.matter_node_id`, so the old metadata-only check missed them and
 * they wrongly stayed selectable.
 */
export function isAutomationMatterIneligibleNode(node: ESPCDFNode): boolean {
  return readMatterNodeIdFromCdfNode(node) != null;
}
