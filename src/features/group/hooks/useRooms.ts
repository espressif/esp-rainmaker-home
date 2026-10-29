/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo, useRef } from "react";
import type { ESPCDFGroup } from "@store";
import { getRoomSubGroups } from "@features/group/utils/roomsHelpers";
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
 * Derives rooms from the current home in the store. Syncs on pull-to-refresh,
 * and on focus only when the home is not in the store yet.
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

  const loadRooms = useCallback(async (force = false) => {
    if (!homeId) return;
    setRefreshing(true);
    try {
      await syncHomeWithNodes({ force });
    } catch (error) {
      console.error("Error fetching group:", error);
    } finally {
      setRefreshing(false);
    }
  }, [homeId, syncHomeWithNodes]);

  const loadRoomsRef = useRef(loadRooms);
  loadRoomsRef.current = loadRooms;

  useFocusEffect(
    useCallback(() => {
      // The store already holds the rooms after the home sync, and the create
      // and delete flows sync on their own, so a focus must not re-download the
      // whole home. Fetch only when this home is not in the store yet (screen
      // opened before the first sync landed). Pull-to-refresh is the explicit
      // refresh.
      if (!groupStore?.groupsByIDMap?.[homeId as string]) {
        loadRoomsRef.current();
      }
    }, [homeId, groupStore])
  );

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    await loadRooms(true);
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
