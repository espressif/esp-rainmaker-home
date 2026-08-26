/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import type { TFunction } from "i18next";
import type { RoomType } from "@src/types/global";
import { getPredefinedRoomOptions } from "@features/group/utils/customizeRoomNameHelpers";
import { firstRouteParam, parseRouteParamBoolean } from "@shared/utils/common";

export interface UseCustomizeRoomNameOptions {
  currentRoomName: string | string[] | undefined;
  id: string | string[] | undefined;
  roomId: string | string[] | undefined;
  /** Carried from Create Room (e.g. provision `dismissTo`). */
  dismissTo?: string | string[] | undefined;
  nodeId?: string | string[] | undefined;
  showSelection?: string | string[] | undefined;
  /** Device endpoint param to restore on return to device settings. */
  settingsDevice?: string | string[] | undefined;
  router: { dismissTo: (opts: { pathname: string; params: Record<string, unknown> }) => void; back: () => void };
  t: TFunction;
}

export interface UseCustomizeRoomNameResult {
  selectedRoom: string;
  roomName: string;
  predefinedRooms: RoomType[];
  canConfirm: boolean;
  handleConfirm: () => void;
  handleCustomRoomNameChange: (value: string) => void;
  handleRoomSelection: (roomLabel: string) => void;
}

/**
 * Manages customize room name state and related actions.
 */
export function useCustomizeRoomName(
  options: UseCustomizeRoomNameOptions
): UseCustomizeRoomNameResult {
  const {
    currentRoomName,
    id,
    roomId,
    dismissTo,
    nodeId,
    showSelection,
    settingsDevice,
    router,
    t,
  } = options;

  const [selectedRoom, setSelectedRoom] = useState("");
  const [roomName, setRoomName] = useState("");

  const predefinedRooms = useMemo(
    () => getPredefinedRoomOptions(t),
    [t]
  );

  useEffect(() => {
    if (!currentRoomName) return;
    const roomNameStr = Array.isArray(currentRoomName)
      ? currentRoomName[0]
      : currentRoomName;
    const isPredefined = predefinedRooms.find((room) => room.label === roomNameStr);
    if (isPredefined) {
      setSelectedRoom(roomNameStr);
    } else {
      setRoomName(roomNameStr);
    }
  }, [currentRoomName, predefinedRooms]);

  const handleConfirm = useCallback(() => {
    const finalRoomName = roomName.trim() || selectedRoom;
    if (finalRoomName) {
      const dismissToParam = firstRouteParam(dismissTo);
      const nodeIdParam  = firstRouteParam(nodeId);
      const settingsDeviceParam = firstRouteParam(settingsDevice);
      const showSelectionBool = parseRouteParamBoolean(
        firstRouteParam(showSelection),
        true
      );
      const homeId = firstRouteParam(id);
      const roomIdParam = firstRouteParam(roomId);
      router.dismissTo({
        pathname: "/(group)/CreateRoom",
        params: {
          roomName: finalRoomName,
          ...(homeId ? { id: homeId } : {}),
          ...(roomIdParam ? { roomId: roomIdParam } : {}),
          ...(dismissToParam ? { dismissTo: dismissToParam } : {}),
          ...(nodeIdParam ? { nodeId: nodeIdParam } : {}),
          ...(settingsDeviceParam ? { settingsDevice: settingsDeviceParam } : {}),
          ...(!showSelectionBool ? { showSelection: "0" } : {}),
        },
      });
    } else {
      router.back();
    }
  }, [
    roomName,
    selectedRoom,
    router,
    id,
    roomId,
    dismissTo,
    nodeId,
    settingsDevice,
    showSelection,
  ]);

  const handleCustomRoomNameChange = useCallback((value: string) => {
    setRoomName(value);
    if (value.trim()) {
      setSelectedRoom("");
    }
  }, []);

  const handleRoomSelection = useCallback((roomLabel: string) => {
    setSelectedRoom(roomLabel);
    setRoomName("");
  }, []);

  const canConfirm = Boolean(selectedRoom || roomName.trim());

  return {
    selectedRoom,
    roomName,
    predefinedRooms,
    canConfirm,
    handleConfirm,
    handleCustomRoomNameChange,
    handleRoomSelection,
  };
}
