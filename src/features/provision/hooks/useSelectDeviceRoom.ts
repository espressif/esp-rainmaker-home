/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import type { ESPCDFGroup, ESPCDFNode } from "@store";
import {
  findProvisionedNodeById,
  getSelectableRoomsForHome,
  normalizeLocalParam,
} from "@features/provision/utils/selectDeviceRoomHelpers";

export interface UseSelectDeviceRoomReturn {
  rooms: ESPCDFGroup[];
  selectedRoom: ESPCDFGroup | null;
  handleSelectRoom: (room: ESPCDFGroup) => void;
  handleOpenCreateRoom: () => void;
  handleFinish: () => Promise<void>;
  /** Skip room assignment; go to guide (if any) or home. */
  handleSkip: () => void;
  isLoading: boolean;
  provisionedNode: ESPCDFNode | null;
  currentHomeId: string | null | undefined;
}

/** Post-provision: pick a room, assign device, then Guide (if readme) or Home. */
export const useSelectDeviceRoom = (): UseSelectDeviceRoomReturn => {
  const router = useRouter();
  const toast = useToast();
  const { t } = useTranslation();
  const { store, syncHomeWithNodes } = useCDF();
  const params = useLocalSearchParams<{
    nodeId: string;
    /** Set when returning from Create Room (provision) so the new room appears selected */
    selectedRoomId?: string | string[];
  }>();
  const nodeId = normalizeLocalParam(params.nodeId);
  const selectedRoomId = normalizeLocalParam(params.selectedRoomId);

  const [selectedRoom, setSelectedRoom] = useState<ESPCDFGroup | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const currentHomeId = store?.groupStore?.currentHomeId;
  const home = currentHomeId
    ? store?.groupStore?.groupsByIDMap?.[currentHomeId] ?? null
    : null;

  const provisionedNode = useMemo(
    () => findProvisionedNodeById(store?.nodeStore?.nodesList, nodeId),
    [nodeId, store?.nodeStore?.nodesList]
  );

  const rooms = useMemo(
    () => getSelectableRoomsForHome(home),
    [home],
  );

  useEffect(() => {
    if (!selectedRoomId || rooms.length === 0) return;
    const match = rooms.find((r) => r.id === selectedRoomId);
    if (match) setSelectedRoom(match);
  }, [selectedRoomId, rooms]);

  const handleSelectRoom = useCallback((room: ESPCDFGroup) => {
    setSelectedRoom(room);
  }, []);

  const handleOpenCreateRoom = useCallback(
    () => {
      if (!currentHomeId || !nodeId) return;
      router.push({
        pathname: "/(group)/CreateRoom" as const,
        params: {
          id: currentHomeId,
          dismissTo: "/(provision)/SelectDeviceRoom",
          nodeId,
          showSelection: "0"
        } as any,
      });
    },
    [currentHomeId, nodeId, router]
  );

  const navigateAfterRoomStep = useCallback(() => {
    if (!provisionedNode) return;

    const readmeUrl = (provisionedNode?.nodeConfig?.info as { readme?: string })
      ?.readme;
    const device = provisionedNode.devices?.[0];
    const headerName = provisionedNode?.nodeConfig?.info?.name || "Device";
    const deviceDisplayName = device?.displayName || headerName;

    if (readmeUrl) {
      router.push({
        pathname: "/(control)/Guide" as const,
        params: {
          url: readmeUrl,
          title: headerName,
          deviceName: deviceDisplayName,
          fromProvisionFlow: "true",
        } as any,
      });
    } else {
      router.dismissTo("/(group)/Home" as any);
    }
  }, [provisionedNode, router]);

  const handleSkip = useCallback(() => {
    if (!provisionedNode || isLoading) return;
    navigateAfterRoomStep();
  }, [isLoading, navigateAfterRoomStep, provisionedNode]);

  const handleFinish = useCallback(async () => {
    if (!provisionedNode || !selectedRoom) return;

    setIsLoading(true);
    try {
      const alreadyInRoom =
        selectedRoom.nodeIds?.includes(provisionedNode.id) ?? false;

      if (!alreadyInRoom) {
        try {
          await selectedRoom.addNodes([provisionedNode.id]);
          toast.showSuccess(t("device.deviceDetails.deviceAddedToRoom"));
        } catch (e) {
          console.warn("[SelectDeviceRoom] addNodes failed:", e);
          toast.showError(t("group.errors.fallback"));
          return;
        }
      }
      
      await syncHomeWithNodes()
      navigateAfterRoomStep();
    } catch (error) {
      console.error("[SelectDeviceRoom] handleFinish error:", error);
      router.dismissTo("/(group)/Home" as any);
    } finally {
      setIsLoading(false);
    
    }
  }, [
    navigateAfterRoomStep,
    provisionedNode,
    selectedRoom,
    router,
    syncHomeWithNodes,
    t,
    toast,
  ]);

  return {
    rooms,
    selectedRoom,
    handleSelectRoom,
    handleOpenCreateRoom,
    handleFinish,
    handleSkip,
    isLoading,
    provisionedNode,
    currentHomeId,
  };
};
