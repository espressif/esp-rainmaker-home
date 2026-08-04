/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFGroup } from "@store";

type PendingCreatedRoom = {
  homeId: string;
  room: ESPCDFGroup;
};

type GroupStoreLike = {
  groupsByIDMap?: Record<string, ESPCDFGroup | undefined>;
  updateGroup: (groupId: string, update: Partial<ESPCDFGroup>) => void;
};

let pendingCreatedRoom: PendingCreatedRoom | null = null;

/**
 * Remembers a room just created via `createSubGroup` so a subsequent
 * `syncHomeWithNodes` that returns before the cloud lists it cannot wipe it
 * from the Home Management room list.
 */
export function rememberPendingCreatedRoom(
  homeId: string,
  room: ESPCDFGroup,
): void {
  if (!homeId || !room?.id) return;
  pendingCreatedRoom = { homeId, room };
}

/**
 * After a home/groups sync, re-attach the pending created room when the sync
 * payload omitted it. Clears the pending entry once the room is present from
 * the cloud.
 */
export function reconcilePendingCreatedRoom(
  homeId: string | undefined,
  groupStore: GroupStoreLike | null | undefined,
): void {
  if (!pendingCreatedRoom || !homeId || !groupStore) return;
  if (pendingCreatedRoom.homeId !== homeId) return;

  const home = groupStore.groupsByIDMap?.[homeId];
  if (!home) return;

  const subGroups = (home.subGroups as ESPCDFGroup[] | undefined) ?? [];
  const alreadyPresent = subGroups.some(
    (room) => room.id === pendingCreatedRoom!.room.id,
  );
  if (alreadyPresent) {
    pendingCreatedRoom = null;
    return;
  }

  groupStore.updateGroup(homeId, {
    subGroups: [...subGroups, pendingCreatedRoom.room],
  });
}
