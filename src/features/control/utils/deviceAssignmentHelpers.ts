/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { getSelectableRoomsForHome } from "@features/provision/utils/selectDeviceRoomHelpers";
import type { ESPCDFGroup } from "@store";

/** Label + id pair for settings list pickers. */
export interface SettingsPickerOption {
  id: string;
  label: string;
}

/**
 * Room subgroups whose `nodeIds` include the given node.
 * @param rooms - Selectable room subgroups for the current home
 * @param nodeId - RainMaker node id
 * @returns Rooms that currently contain the node
 */
export function getRoomsContainingNode(
  rooms: ESPCDFGroup[],
  nodeId: string | undefined,
): ESPCDFGroup[] {
  if (!nodeId) {
    return [];
  }
  return rooms.filter((room) => room.nodeIds?.includes(nodeId) ?? false);
}

/**
 * Selectable rooms for a home, mapped to picker rows.
 * @param home - Current home group
 * @returns Room picker options sorted by display name
 */
export function getRoomPickerOptions(
  home: ESPCDFGroup | null | undefined,
): SettingsPickerOption[] {
  return getSelectableRoomsForHome(home)
    .map((room) => ({
      id: room.id,
      label: room.name?.trim() || room.id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Resolves the first room id containing a node (stable display selection).
 * @param rooms - Selectable rooms for the current home
 * @param nodeId - RainMaker node id
 * @returns Room id when assigned, otherwise undefined
 */
export function getPrimaryRoomIdForNode(
  rooms: ESPCDFGroup[],
  nodeId: string | undefined,
): string | undefined {
  return getRoomsContainingNode(rooms, nodeId)[0]?.id;
}

/**
 * Moves a node into a room: removes from other rooms, then adds to the target.
 * Sequential add/remove avoids MQTT resync races (same as room edit flow).
 * @param rooms - All selectable rooms on the home
 * @param nodeId - Node to assign
 * @param targetRoomId - Chosen room subgroup id
 */
export async function moveNodeToRoom(
  rooms: ESPCDFGroup[],
  nodeId: string,
  targetRoomId: string,
): Promise<void> {
  const currentRooms = getRoomsContainingNode(rooms, nodeId);
  const alreadyInTarget = currentRooms.some((room) => room.id === targetRoomId);

  if (alreadyInTarget && currentRooms.length === 1) {
    return;
  }

  for (const room of currentRooms) {
    if (room.id !== targetRoomId) {
      await room.removeNodes([nodeId]);
    }
  }

  if (!alreadyInTarget) {
    const targetRoom = rooms.find((room) => room.id === targetRoomId);
    if (!targetRoom) {
      throw new Error("Target room not found");
    }
    await targetRoom.addNodes([nodeId]);
  }
}
