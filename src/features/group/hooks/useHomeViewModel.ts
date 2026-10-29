/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from "react";
import { ESPCDFGroup, ESPCDFNode } from "@store";
import { RoomTab } from "@src/types/global";
import { transformNodesToDevices } from "@shared/utils/device";
import {
  validateHomeData,
  createRoomTabs,
  getFilteredDevices,
} from "@features/group/utils/home";
import {
  getDeviceGroupSubGroups,
  getRoomSubGroups,
} from "@features/group/utils/roomsHelpers";

export interface UseHomeViewModelParams {
  selectedHome: ESPCDFGroup | null;
  selectedRoom: RoomTab;
  activeHomeNodes: ESPCDFNode[];
  defaultTabs: RoomTab[];
}

export interface UseHomeViewModelResult {
  roomTabs: RoomTab[];
  rooms: ESPCDFGroup[];
  /** `gc_*` subgroups for the current home (group control). */
  groupControlGroups: ESPCDFGroup[];
  devices: ReturnType<typeof transformNodesToDevices>;
  roomDevices: ReturnType<typeof getFilteredDevices>;
  processedHome: ESPCDFGroup | null;
  /**
   * The selected tab as it is now: same id with the room's current name, or the
   * first tab when the selected room no longer exists (deleted elsewhere).
   */
  activeRoom: RoomTab;
}

/**
 * View model hook for the Home screen.
 * Derives roomTabs, rooms, devices, and roomDevices from home and node data.
 *
 * Deliberately not memoized on the home object: the CDF keeps the same home and
 * room instances and edits them in place (a room created, renamed or deleted),
 * so a memo keyed on `selectedHome` would never recompute. The Home screen is a
 * MobX observer, so computing here makes it track every field it reads (the
 * room list, each room's name and node ids) and re-render on exactly those.
 */
export function useHomeViewModel({
  selectedHome,
  selectedRoom,
  activeHomeNodes,
  defaultTabs,
}: UseHomeViewModelParams): UseHomeViewModelResult {
  const processedHome = validateHomeData(selectedHome);
  const subGroups = (selectedHome?.subGroups as ESPCDFGroup[]) ?? [];
  const roomTabs = createRoomTabs(processedHome, defaultTabs);
  const rooms = getRoomSubGroups(subGroups);
  const groupControlGroups = getDeviceGroupSubGroups(subGroups);
  const activeRoom =
    roomTabs.find((tab) => tab.id === selectedRoom.id) ?? roomTabs[0] ?? selectedRoom;

  const devices = useMemo(
    () => transformNodesToDevices(activeHomeNodes),
    [activeHomeNodes]
  );
  const roomDevices = getFilteredDevices(activeRoom, rooms, activeHomeNodes, devices);

  return {
    roomTabs,
    rooms,
    groupControlGroups,
    devices,
    roomDevices,
    processedHome,
    activeRoom,
  };
}
