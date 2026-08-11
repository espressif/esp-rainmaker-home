/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo, useRef } from "react";
import type { ESPCDFGroup } from "@store";
import { getRoomSubGroups } from "@features/group/utils/roomsHelpers";
import { reconcilePendingCreatedRoom } from "@features/group/utils/pendingCreatedRoom";
import { useCDF } from "@shared/hooks/useCDF";
import { useFocusEffect } from "expo-router";
import { hasGroupLevelAccess } from "@shared/utils/groupAccess";

export interface UseRoomsOptions {
  homeId: string | undefined;
  router: { push: (href: unknown) => void; canGoBack?: () => boolean };
}

export interface UseRoomsResult {
  home: ESPCDFGroup | null;
  rooms: ESPCDFGroup[];
  /** False for subgroup-only viewers — the backend rejects room creation for them. */
  canAddRoom: boolean;
  refreshing: boolean;
  handleRefresh: () => Promise<void>;
  handleAddRoom: () => void;
  handlePressRoom: (roomId: string) => void;
}

/**
 * Hook that encapsulates Rooms list business logic and state.
 * Derives rooms from current home in store; syncs on focus and refresh.
 */
export function useRooms(options: UseRoomsOptions): UseRoomsResult {
  const { homeId, router } = options;
  const { store, syncHomeWithNodes } = useCDF();
  const { groupStore } = store;

  const [refreshing, setRefreshing] = useState(false);
  const home = groupStore?.groupsByIDMap?.[homeId as string] ?? null;

  // Subgroup-only viewers can browse their shared rooms but cannot create new ones.
  const canAddRoom = hasGroupLevelAccess(home?.accessType);

  const rooms = useMemo(() => {
    const subGroups = (home?.subGroups as ESPCDFGroup[]) || [];
    return getRoomSubGroups(subGroups);
  }, [home?.subGroups]);

  const loadRooms = useCallback(async () => {
    if (!homeId) return;
    setRefreshing(true);
    try {
      await syncHomeWithNodes(true);
      // Re-attach a just-created room if sync returned a stale groups list.
      reconcilePendingCreatedRoom(homeId, groupStore);
    } catch (error) {
      console.error("Error fetching group:", error);
    } finally {
      setRefreshing(false);
    }
  }, [homeId, syncHomeWithNodes, groupStore]);

  const loadRoomsRef = useRef(loadRooms);
  loadRoomsRef.current = loadRooms;

  useFocusEffect(
    useCallback(() => {
      loadRoomsRef.current();
    }, [])
  );

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    await loadRooms();
  }, [loadRooms, refreshing]);

  const handleAddRoom = useCallback(() => {
    // Subgroup-only viewers cannot create rooms (backend-rejected); the entry
    // points are hidden, this guards any remaining path (e.g. empty state).
    if (!canAddRoom) return;
    router.push({
      pathname: "/(group)/CreateRoom",
      params: { id: homeId, dismissTo: "/(group)/Rooms" },
    } as any);
  }, [router, homeId, canAddRoom]);

  const handlePressRoom = useCallback(
    (roomId: string) => {
      const room = rooms.find((r) => r.id === roomId);
      if (room) {
        router.push({
          pathname: "/(group)/CreateRoom",
          params: { roomId: room.id, id: home?.id },
        } as any);
      }
    },
    [router, home?.id, rooms]
  );

  return {
    home: home ?? null,
    rooms,
    canAddRoom,
    refreshing,
    handleRefresh,
    handleAddRoom,
    handlePressRoom,
  };
}
