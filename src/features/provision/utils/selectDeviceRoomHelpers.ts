/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { getRoomSubGroups } from "@features/group/utils/roomsHelpers";
import { firstRouteParam } from "@shared/utils/common";
import type { ESPCDFGroup, ESPCDFNode } from "@store";

/**
 * Normalizes expo-router `useLocalSearchParams` values that may be `string` or `string[]`.
 * Alias of {@link firstRouteParam}; kept for call sites in the provision feature.
 */
export const normalizeLocalParam = firstRouteParam;

/**
 * Finds a node in the store list by id (provision / post-provision flows).
 * @param nodesList - Current nodes from `nodeStore`
 * @param nodeId - Target node id from route params
 * @returns The matching node, or `null` if missing or `nodeId` is empty
 */
export function findProvisionedNodeById(
  nodesList: ESPCDFNode[] | undefined | null,
  nodeId: string | undefined
): ESPCDFNode | null {
  if (!nodeId) return null;
  return nodesList?.find((n) => n.id === nodeId) ?? null;
}

/**
 * Room subgroups for the select-device-room screen from the current home.
 * @param home - Current home group from the store
 * @returns Deduped room-style subgroups
 */
export function getSelectableRoomsForHome(
  home: ESPCDFGroup | null | undefined
): ESPCDFGroup[] {
  const subGroups = (home?.subGroups as ESPCDFGroup[]) || [];
  return getRoomSubGroups(subGroups);
}

/**
 * First selectable room (by list order) whose `nodeIds` already includes `nodeId`.
 * Used to pre-select an existing subgroup association (matched by subgroup id).
 * @param rooms - Selectable rooms for the current home
 * @param nodeId - Provisioned node id
 * @returns Room id, or `undefined` when the node is not in any room
 */
export function getPreselectedRoomIdForNode(
  rooms: ESPCDFGroup[],
  nodeId: string | undefined
): string | undefined {
  if (!nodeId) return undefined;
  return rooms.find((room) => room.nodeIds?.includes(nodeId) ?? false)?.id;
}

/**
 * Whether Save should call `addNodes` for the selected room.
 * Looks up the room by **subgroup id** (not name) and skips add when that
 * room's `nodeIds` already includes the provisioned node.
 * Never implies a remove from any other room.
 * @param rooms - Selectable rooms for the current home
 * @param selectedRoomId - Chosen room / subgroup id
 * @param nodeId - Provisioned node id
 * @returns `true` only when the node is not yet a member of that subgroup
 */
export function shouldAddNodeToSelectedRoom(
  rooms: ESPCDFGroup[],
  selectedRoomId: string,
  nodeId: string
): boolean {
  const room = rooms.find((r) => r.id === selectedRoomId);
  if (!room) {
    return true;
  }
  return !(room.nodeIds?.includes(nodeId) ?? false);
}
