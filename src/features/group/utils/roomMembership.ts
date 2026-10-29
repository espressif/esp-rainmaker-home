/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFGroup } from "@store";

/**
 * Puts devices into one room and takes them out of every other room of the
 * home, so a device is in at most one room on every backend.
 *
 * - Classic and Matter: the cloud already drops a device from its sibling
 *   rooms when it joins another one, but the store does not know that. Removing
 *   it here keeps the store in step with the cloud.
 * - Neo: the cloud lets a device sit in up to three sub-groups. Removing it
 *   here is what enforces one room per device, and frees a slot before the add.
 *
 * Calls run one after another: parallel add and remove raced the MQTT shadow
 * resync on Neo.
 * @param rooms - Room sub-groups of the home (control groups excluded)
 * @param nodeIds - Devices to place in `targetRoom`
 * @param targetRoom - Room the devices belong to afterwards
 */
export async function assignNodesToRoom(
  rooms: ESPCDFGroup[],
  nodeIds: string[],
  targetRoom: ESPCDFGroup,
): Promise<void> {
  if (nodeIds.length === 0) return;
  const moving = new Set(nodeIds);
  for (const room of rooms) {
    if (room.id === targetRoom.id) continue;
    const leaving = (room.nodeIds ?? []).filter((id) => moving.has(id));
    if (leaving.length > 0) {
      await room.removeNodes(leaving);
    }
  }
  const alreadyIn = new Set(targetRoom.nodeIds ?? []);
  const toAdd = nodeIds.filter((id) => !alreadyIn.has(id));
  if (toAdd.length > 0) {
    await targetRoom.addNodes(toAdd);
  }
}
