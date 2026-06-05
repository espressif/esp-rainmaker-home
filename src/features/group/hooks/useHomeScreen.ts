/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import type { ESPCDFGroup } from "@store";
import { useCDF } from "@shared/hooks/useCDF";
import { useHomeViewModel, type UseHomeViewModelResult } from "./useHomeViewModel";
import { useMigrationPromptViewModel } from "./useMigrationPromptViewModel";
import { useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useToast } from "@shared/hooks/useToast";
import { getDefaultHomeTabs, compareDeviceType } from "@features/group/utils/homeScreenHelpers";
import { ALL_DEVICES_TAB_ID, FILTER_ALL } from "@features/group/utils/constants";
import { startNodeLocalDiscovery } from "@features/group/utils/localDiscovery";
import { startMatterLocalDiscovery } from "@features/matter/utils/matterLocalDiscovery";
import type { RoomTab } from "@src/types/global";
import { getFeatures } from "@/config/features.config";

export interface UseHomeScreenResult {
  isLoading: boolean;
  refreshing: boolean;
  selectedRoom: RoomTab;
  setSelectedRoom: (tab: RoomTab) => void;
  roomTabs: RoomTab[];
  roomDevices: UseHomeViewModelResult["roomDevices"];
  filteredRoomDevices: UseHomeViewModelResult["roomDevices"];
  selectedDeviceTypeFilter: string;
  setSelectedDeviceTypeFilter: (filter: string) => void;
  selectedRoomGroup: ESPCDFGroup | undefined;
  controlGroups: UseHomeViewModelResult["groupControlGroups"];
  homeList: ESPCDFGroup[];
  selectedHome: ESPCDFGroup | null;
  tooltipVisible: boolean;
  tooltipPosition: { x: number; y: number };
  handleDropdownPress: (position: { x: number; y: number }) => void;
  handleCloseTooltip: () => void;
  handleHomeSelect: (home: ESPCDFGroup) => Promise<void>;
  onRefresh: () => Promise<void>;
  redirectOperations: (type: string) => void;
  showMigrationPrompt: boolean;
  handleMigrationPromptUnderstood: () => Promise<void>;
}

/**
 * Manages home screen state and related actions.
 */
export function useHomeScreen(): UseHomeScreenResult {
  const { t } = useTranslation();
  const { store, isInitialized: isStoreInitialized } = useCDF();
  const { groupStore: unifiedGroupStore, userStore: unifiedUserStore } = store;
  const unifiedUser = unifiedUserStore?.user;
  const router = useRouter();
  const toast = useToast();
  const defaultTabs = useMemo(() => getDefaultHomeTabs(t), [t]);
  const hasInitialized = useRef(false);
  const initializeHomeRef = useRef<(() => Promise<void>) | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<RoomTab>(
    defaultTabs[0] ?? { label: "", id: ALL_DEVICES_TAB_ID }
  );
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  const homeList = unifiedGroupStore.groupsList;
  const selectedHome = store.getCurrentHome() ?? null;
  const activeHomeNodes = store.getNodesForCurrentHome();

  const { roomTabs, roomDevices, rooms, groupControlGroups: raw } =
    useHomeViewModel({
      selectedHome,
      selectedRoom,
      activeHomeNodes,
      defaultTabs,
    });

  const controlGroups = getFeatures().controlGroups ? raw : [];

  const [selectedDeviceTypeFilter, setSelectedDeviceTypeFilter] =
    useState(FILTER_ALL);

  useEffect(() => {
    setSelectedDeviceTypeFilter(FILTER_ALL);
  }, [selectedRoom.id]);

  const selectedRoomGroup = useMemo(
    () =>
      selectedRoom.id !== ALL_DEVICES_TAB_ID
        ? rooms.find((r) => r.id === selectedRoom.id)
        : undefined,
    [selectedRoom.id, rooms]
  );

  const filteredRoomDevices = useMemo(() => {
    if (selectedDeviceTypeFilter === FILTER_ALL) return roomDevices;
    return roomDevices.filter((d) =>
      compareDeviceType(d.type, selectedDeviceTypeFilter)
    );
  }, [roomDevices, selectedDeviceTypeFilter]);

  const { showMigrationPrompt, handleMigrationPromptUnderstood } =
    useMigrationPromptViewModel({ store, unifiedUser });

  const initializeHome = useCallback(async () => {
    if (hasInitialized.current) return;
    try {
      if (!isStoreInitialized || !unifiedGroupStore) {
        setIsLoading(false);
        return;
      }
      hasInitialized.current = true;
      // Kick off mDNS browses in parallel with the cloud sync. Discovery is
      // continuous and the CDF index is rebuilt per event, so even if the
      // first announcements arrive before the store is populated they are
      // simply dropped and re-matched against the next periodic announcement
      // (mDNS responders re-announce every 1-2s). Doing this in parallel
      // shaves the cloud-sync round-trip off the time-to-"available on WLAN".
      const syncPromise = unifiedUser?.syncHomeWithNodes?.();
      startNodeLocalDiscovery(store);
      startMatterLocalDiscovery(store);
      await syncPromise;
    } catch (error) {
      console.error("Failed to initialize home:", error);
      hasInitialized.current = false;
      toast.showError(
        t("group.errors.failedToInitializeHome"),
        t("layout.shared.manualRefreshHelperText")
      );
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, [isStoreInitialized, unifiedGroupStore, unifiedUser, toast, t]);

  initializeHomeRef.current = initializeHome;

  useFocusEffect(
    useCallback(() => {
      initializeHomeRef.current?.();
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const syncPromise = unifiedUser?.syncHomeWithNodes?.();
      startNodeLocalDiscovery(store);
      startMatterLocalDiscovery(store);
      await syncPromise;
    } catch (error) {
      console.error("Error refreshing home:", error);
    } finally {
      setRefreshing(false);
    }
  }, [unifiedUser, store]);

  const handleHomeSelect = useCallback(
    async (home: ESPCDFGroup) => {
      if (home?.id) {
        await unifiedUser?.setCurrentHome?.(home);
        await unifiedUser?.syncHomeWithNodes?.();
        startNodeLocalDiscovery(store);
        startMatterLocalDiscovery(store);
        setTooltipVisible(false);
      }
    },
    [unifiedUser, store]
  );

  const handleDropdownPress = useCallback(
    (position: { x: number; y: number }) => {
      setTooltipPosition(position);
      setTooltipVisible((v) => !v);
    },
    []
  );

  const handleCloseTooltip = useCallback(() => setTooltipVisible(false), []);

  const redirectOperations = useCallback(
    (type: string) => {
      if (type === "AddDevice") {
        router.push({
          pathname: "/(provision)/AddDeviceSelection",
        } as Parameters<typeof router.push>[0]);
      }
    },
    [router]
  );

  useFocusEffect(
    useCallback(() => {
      setTooltipVisible(false);
    }, [])
  );

  return {
    isLoading,
    refreshing,
    selectedRoom,
    setSelectedRoom,
    roomTabs,
    roomDevices,
    filteredRoomDevices,
    selectedDeviceTypeFilter,
    setSelectedDeviceTypeFilter,
    selectedRoomGroup,
    controlGroups,
    homeList,
    selectedHome,
    tooltipVisible,
    tooltipPosition,
    handleDropdownPress,
    handleCloseTooltip,
    handleHomeSelect,
    onRefresh,
    redirectOperations,
    showMigrationPrompt,
    handleMigrationPromptUnderstood,
  };
}
