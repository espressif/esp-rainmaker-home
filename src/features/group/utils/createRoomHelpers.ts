/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Node } from "@src/types/global";
import { getDeviceDisplayName } from "@shared/utils/deviceDisplayName";

/**
 * Maps a store node to the display shape used by room/group node lists.
 */
export function mapNodeToDisplay(node: any): Node {
  return {
    id: node.id,
    name:
      node.devices?.map((d: any) => getDeviceDisplayName(d, node)).join(", ") ??
      "",
    node,
  };
}

/**
 * Returns node IDs to add and remove when updating a room.
 * Pure; no side effects.
 */
export function getNodeDiff(
  existingNodeIds: string[],
  newNodeIds: string[]
): { toAdd: string[]; toRemove: string[] } {
  const toRemove =
    existingNodeIds.filter((id) => !newNodeIds.includes(id)) || [];
  const toAdd =
    newNodeIds.filter((id) => !existingNodeIds.includes(id)) || [];
  return { toAdd, toRemove };
}
