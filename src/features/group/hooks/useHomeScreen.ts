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
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { useToast } from "@shared/hooks/useToast";
import { getDefaultHomeTabs, compareDeviceType } from "@features/group/utils/homeScreenHelpers";
import { ALL_DEVICES_TAB_ID, FILTER_ALL } from "@features/group/utils/constants";
import { useAddDeviceNavigation } from "@features/provision/hooks";
import { startNodeLocalDiscovery } from "@features/group/utils/localDiscovery";
import { startMatterLocalDiscovery } from "@features/matter/utils/matterLocalDiscovery";
import type { RoomTab } from "@src/types/global";
import { getFeatures } from "@/config/features.config";
import { DEFAULT_HOME_GROUP_NAME } from "@shared/utils/constants";

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
  const { store, isInitialized: isStoreInitialized, syncHomeWithNodes } = useCDF();
  const { groupStore: unifiedGroupStore, userStore: unifiedUserStore } = store;
  const unifiedUser = unifiedUserStore?.user;
  const toast = useToast();
  const goToAddDevice = useAddDeviceNavigation();
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
      // Keep the loading skeleton until CDF is ready; a follow-up effect
      // re-invokes this when `isStoreInitialized` flips true.
      if (!isStoreInitialized || !unifiedGroupStore) {
        return;
      }
      hasInitialized.current = true;

      // Do not await sync here — that locked Home `isLoading` (skeletons /
      // banner dropdown) until the full group+node fetch finished. Kick sync
      // in the background; MobX paints cards as CDF fills, and we clear the
      // loading gate when the shared sync promise settles.
      const alreadyHasContent =
        Boolean(store.getCurrentHome()) ||
        store.getNodesForCurrentHome().length > 0;
      if (alreadyHasContent) {
        setIsLoading(false);
      }

      startNodeLocalDiscovery(store);
      startMatterLocalDiscovery(store);
      void syncHomeWithNodes(true)
        .catch((error: unknown) => {
          console.error("Failed to initialize home:", error);
          toast.showError(
            t("group.errors.failedToInitializeHome"),
            t("layout.shared.manualRefreshHelperText")
          );
        })
        .finally(() => {
          setIsLoading(false);
        });
    } catch (error) {
      console.error("Failed to initialize home:", error);
      hasInitialized.current = false;
      setIsLoading(false);
      toast.showError(
        t("group.errors.failedToInitializeHome"),
        t("layout.shared.manualRefreshHelperText")
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, [isStoreInitialized, unifiedGroupStore, syncHomeWithNodes, toast, t, store]);

  initializeHomeRef.current = initializeHome;

  /**
   * If `currentHomeId` points at a deleted home (or selection is empty while
   * homes still exist), reselect — or create the default home instantly when
   * the list is empty — so the banner dropdown is not stuck loading.
   * Runs on focus after the one-shot init — delete/leave does not remount Home.
   */
  const recoverStaleHomeSelection = useCallback(async () => {
    if (!isStoreInitialized || !unifiedGroupStore) return;
    if (store.getCurrentHome()) return;

    const homes = unifiedGroupStore.groupsList ?? [];
    const hasStaleCurrentId = Boolean(unifiedGroupStore.currentHomeId);
    if (!hasStaleCurrentId && homes.length === 0) return;

    try {
      if (homes.length > 0) {
        await unifiedUser?.setCurrentHome?.(homes[0]);
        return;
      }

      unifiedGroupStore.currentHomeId = null;
      const newHome = await unifiedUser?.createHome?.({
        name: DEFAULT_HOME_GROUP_NAME,
      });
      if (newHome) {
        await unifiedUser?.setCurrentHome?.(newHome);
        return;
      }

      await syncHomeWithNodes(true);
    } catch (error: unknown) {
      console.error("Failed to recover stale home selection:", error);
    }
  }, [
    isStoreInitialized,
    unifiedGroupStore,
    store,
    unifiedUser,
    syncHomeWithNodes,
  ]);

  useFocusEffect(
    useCallback(() => {
      const alreadyInitialized = hasInitialized.current;
      initializeHomeRef.current?.();
      // Only recover on subsequent focuses (e.g. after delete). First focus
      // relies on initializeHome's sync to establish selection.
      if (alreadyInitialized) {
        void recoverStaleHomeSelection();
      }
    }, [recoverStaleHomeSelection])
  );

  // Retry init when the store becomes ready while Home is already focused.
  useEffect(() => {
    if (isStoreInitialized && !hasInitialized.current) {
      void initializeHomeRef.current?.();
    }
  }, [isStoreInitialized]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const syncPromise = syncHomeWithNodes(true);
      startNodeLocalDiscovery(store);
      startMatterLocalDiscovery(store);
      await syncPromise;
    } catch (error) {
      console.error("Error refreshing home:", error);
    } finally {
      setRefreshing(false);
    }
  }, [syncHomeWithNodes, store]);

  const handleHomeSelect = useCallback(
    async (home: ESPCDFGroup) => {
      if (home?.id) {
        await unifiedUser?.setCurrentHome?.(home);
        await syncHomeWithNodes(true);
        startNodeLocalDiscovery(store);
        startMatterLocalDiscovery(store);
        setTooltipVisible(false);
      }
    },
    [unifiedUser, syncHomeWithNodes, store]
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
        goToAddDevice();
      }
    },
    [goToAddDevice]
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
