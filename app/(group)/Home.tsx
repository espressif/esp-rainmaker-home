/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from "react-native";

import { tokens } from "@/theme/tokens";

// SDK
import {
  ESPRMDevice,
  ESPRMGroup,
  ESPRMNode,
} from "@espressif/rainmaker-base-sdk";

// hooks
import { useCDF } from "@/hooks/useCDF";
import { useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { observer } from "mobx-react-lite";

// icons
import { Plus } from "lucide-react-native";

// components
import {
  Header,
  Banner,
  DeviceCard,
  Tabs,
  ScreenWrapper,
  AddYourFirstDeviceBanner,
  HomeTooltip,
} from "@/components";
// utils
import { transformNodesToDevices } from "@/utils/device";
import {
  validateHomeData,
  getHomeNodes,
  createRoomTabs,
  getFilteredDevices,
  findHomeGroup,
  isHome,
  categorizeGroupsByOwnership,
  ensureHomesAreMutuallyExclusive,
  assignUnassignedNodesToHome,
  createDefaultHomeGroup,
  getValidHomes,
  getUnassignedNodes,
} from "@/utils/home";

// types
import { RoomTab, HomeData } from "@/types/global";
import { startNodeLocalDiscovery } from "@/utils/localDiscovery";
import { updateLastSelectedHome } from "@/utils/common";
import { useToast } from "@/hooks/useToast";

/**
 * HomeScreen component first screen after login
 *
 * This component displays the home screen with a header, a banner, a tabs, and a list of devices.
 * It shows a banner with list of homes in account
 * It displays a list of rooms in a tab layout.
 * It displays a list of devices in a grid layout.
 *
 */
const HomeScreen = () => {
  const { t } = useTranslation();
  const {
    store,
    isInitialized: isStoreInitialized,
    fetchNodesAndGroups,
  } = useCDF();
  const { groupStore, nodeStore, userStore } = store;
  const router = useRouter();
  const toast = useToast();

  const DEFAULT_TABS = [
    { label: t("group.home.commonTab"), id: "common" }, // common devices
  ];

  const hasInitialized = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [homeList, setHomeList] = useState<ESPRMGroup[]>([]);
  const [selectedHome, setSelectedHome] = useState<ESPRMGroup | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<RoomTab>(DEFAULT_TABS[0]);

  // HomeTooltip state
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  // Process and format home data
  const processedHome = useMemo(() => {
    return validateHomeData(selectedHome);
  }, [selectedHome]);

  // Get all connected nodes for this home
  const activeHomeNodes = useMemo(() => {
    return getHomeNodes(processedHome, nodeStore?.nodeList);
  }, [processedHome, nodeStore?.nodeList]);

  // Build navigation tabs for rooms
  const roomNavigationTabs = useMemo(() => {
    return createRoomTabs(processedHome, DEFAULT_TABS);
  }, [processedHome, DEFAULT_TABS]);

  // Transform nodes into device objects
  const homeDevices = useMemo(() => {
    return transformNodesToDevices(activeHomeNodes);
  }, [activeHomeNodes]);

  // Combine all home section data
  const { roomTabs, rooms, devices } = useMemo<HomeData>(() => {
    return {
      roomTabs: roomNavigationTabs,
      rooms: selectedHome?.subGroups || [],
      devices: homeDevices,
    };
  }, [selectedHome?.subGroups, roomNavigationTabs, homeDevices]);

  // Get devices specific to the selected room
  const roomDevices: (ESPRMDevice & { node: WeakRef<ESPRMNode> })[] =
    useMemo(() => {
      return getFilteredDevices(
        selectedRoom,
        rooms,
        nodeStore?.nodeList,
        devices
      );
    }, [selectedRoom, rooms, nodeStore?.nodeList, devices]);

  useFocusEffect(
    useCallback(() => {
      initializeHome();
    }, [])
  );

  /**
   * Redirects to different screens on action
   */
  const redirectOperations = (type: string) => {
    switch (type) {
      case "AddDevice": {
        router.push({
          pathname: "/(device)/AddDeviceSelection",
        } as any);
        break;
      }
    }
  };

  /**
   * Initializes the home screen by preparing user homes, handling device assignments,
   * and updating preferences and UI state.
   *
   * Step-wise Flow:
   * Step 1: Handle initial setup
   *          - If no groups exist: create a new default home with all nodes
   *          - If groups exist: proceed to Steps 2-3
   *
   * Step 2: Ensure all primary home groups have correct mutuallyExclusive flag
   *          - Categorize groups into primaryGroups and sharedGroups (by isPrimaryUser flag)
   *          - Update all primary home groups to have mutuallyExclusive: true in parallel
   *          - CDF interceptor updates groups in place, changes reflected in all references
   *
   * Step 3: Assign unassigned nodes to a home
   *          - Filter valid primary homes (type: "home" && mutuallyExclusive: true)
   *          - Get unassigned nodes (not in any valid primary home or shared home)
   *          - Assign to existing home (preferring one named "Home") OR create new home
   *          - Handle name collision (errorCode 108007) by retrying with random suffix
   *
   * Step 4: Determine the current home to display
   *          - Retrieve lastSelectedHomeId from user preferences (userStore.userInfo.customData)
   *          - Use findHomeGroup() with preferredId (lastSelectedHomeId) if available
   *          - Fallback to first valid home if lastSelectedHomeId not found
   *          - Set currentHomeId in groupStore
   *
   * Step 5: Update user preferences
   *          - Save currentHomeId to user preferences if different from lastSelectedHomeId
   *
   * Step 6: Update UI state
   *          - Filter and set homeList (all valid homes with isHome() check)
   *          - Set selectedHome for display
   *
   * Helper Functions Used:
   * - getUnassignedNodes() - gets nodes that are not assigned to any passed groups and not of type pure_matter or rainmaker_matter
   * - createDefaultHomeGroup() - creates new home group with nodes
   * - categorizeGroupsByOwnership() - separates primary vs shared groups
   * - ensureHomesAreMutuallyExclusive() - updates home groups in parallel
   * - isHome() - validates home group (type: "home" && mutuallyExclusive: true)
   * - assignUnassignedNodesToHome() - assigns nodes to existing/new home
   * - findHomeGroup() - finds home by ID, name, or first valid
   * - updateLastSelectedHome() - persists user's home selection
   *
   * @returns {Promise<void>}
   */
  const initializeHome = useCallback(async () => {
    try {
      // Prevent multiple simultaneous initializations
      if (hasInitialized.current) {
        return;
      }
      hasInitialized.current = true;

      // Step 1: Handle initial setup
      // If no groups exist, create a new default home with all nodes
      if (groupStore?.groupList.length === 0) {
        const unAssignedNodes = getUnassignedNodes(nodeStore?.nodeList, []);
        await createDefaultHomeGroup(userStore.user, unAssignedNodes);
      } else {
        // Step 2: Ensure all primary home groups have correct mutuallyExclusive flag
        // Categorize groups by ownership (primary vs shared based on isPrimaryUser flag)
        const { primaryGroups, sharedGroups: sharedHomes } =
          categorizeGroupsByOwnership(groupStore?.groupList);

        // Update all primary home groups to have mutuallyExclusive: true in parallel
        // CDF interceptor updates groups in place
        await ensureHomesAreMutuallyExclusive(primaryGroups);

        // Step 3: Assign unassigned nodes to a home
        // Filter valid primary homes (type: "home" && mutuallyExclusive: true)
        // The interceptor has already updated mutuallyExclusive in place
        const validPrimaryHomes = getValidHomes(primaryGroups);

        // Assign unassigned nodes to existing home (preferring "Home") or create new home
        // Considers both valid primary homes and shared homes when determining unassigned nodes
        await assignUnassignedNodesToHome(
          userStore.user,
          nodeStore?.nodeList,
          validPrimaryHomes,
          sharedHomes
        );
      }

      // Step 4: Determine the current home to display
      // Retrieve lastSelectedHomeId from user preferences (userStore.userInfo.customData)
      const lastSelectedHomeId =
        userStore.userInfo?.customData?.lastSelectedHomeId?.value || null;

      // Find home by preferredId (lastSelectedHomeId) or fallback to first valid home
      const primaryHome = findHomeGroup(groupStore?.groupList, {
        preferredId: lastSelectedHomeId,
      });

      const currentHomeId = primaryHome?.id || groupStore.currentHomeId;
      const currentHome = groupStore._groupsByID?.[currentHomeId];

      // Set current home ID in group store
      groupStore.currentHomeId = currentHome.id;

      // Step 5: Update user preferences
      // Persist the current home selection if it changed
      if (lastSelectedHomeId !== currentHome.id) {
        updateLastSelectedHome(userStore, currentHome.id);
      }

      // Step 6: Update UI state
      // Filter valid homes and update component state
      const updatedHomeList = getValidHomes(groupStore?.groupList);
      setHomeList(updatedHomeList as ESPRMGroup[]);
      // Spread to create new reference and trigger memoization recomputation
      // CDF interceptor has already updated the group object in place
      setSelectedHome({ ...currentHome });
    } catch (error) {
      console.error("Failed to initialize home:", error);
      toast.showError(
        t("group.errors.failedToInitializeHome"),
        t("layout.shared.manualRefreshHelperText")
      );
    } finally {
      // Reset loading and initialization states
      setIsLoading(false);
      hasInitialized.current = false;
    }
  }, [isStoreInitialized]);

  useEffect(() => {
    if (groupStore.groupList.length > 0) {
      const homeList = groupStore?.groupList.filter(isHome);
      setHomeList(homeList as ESPRMGroup[]);
      if (!homeList.some((home) => home.id === groupStore.currentHomeId)) {
        setSelectedHome(homeList[0]);
      }
    }
  }, [groupStore.groupList]);

  /**
   * Refresh the home screen
   *
   * This function is used to refresh the home screen
   * It syncs the node list and group list with background pagination
   * It initializes the home screen
   */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setIsLoading(true);
      /*
      For refresh operation, we need to fetch the first page again
      */
      const shouldFetchFirstPage = true;
      await fetchNodesAndGroups(shouldFetchFirstPage);
      initializeHome();
      startNodeLocalDiscovery(store);
    } catch (error) {
      // Error refreshing data
    } finally {
      setRefreshing(false);
    }
  }, [nodeStore, groupStore]);

  /**
   * Handle group change
   *
   * This function is used to handle the group change
   * It sets the current group and selected group in local useStates
   */
  const handleHomeSelect = (home: ESPRMGroup) => {
    if (home?.id) {
      groupStore.currentHomeId = home.id;
      updateLastSelectedHome(userStore, home.id);
      setSelectedHome(home);
      setTooltipVisible(false);
    }
  };

  // Handle dropdown press from Banner
  const handleDropdownPress = (position: { x: number; y: number }) => {
    setTooltipPosition(position);
    setTooltipVisible(!tooltipVisible);
  };

  // Close tooltip when focus changes
  useFocusEffect(
    useCallback(() => {
      setTooltipVisible(false);
    }, [selectedHome])
  );

  return (
    <>
      <Header
        label={t("group.home.title")}
        showBack={false}
        rightSlot={
          <>
            <Plus
              size={24}
              color={tokens.colors.primary}
              onPress={() => router.push("/(device)/AddDeviceSelection")}
            />
          </>
        }
      ></Header>

      <ScreenWrapper style={styles.screenContainer} excludeTop={true}>
        {/* Home Banner */}
        <Banner
          activeGroup={selectedHome}
          onDropdownPress={handleDropdownPress}
          image={require("../../assets/images/home.png")}
        />
        {/* Tabs */}
        <Tabs
          tabs={roomTabs}
          activeTab={selectedRoom}
          onSelectTab={(tab) => setSelectedRoom(tab)}
        />
        {isLoading ? (
          <ActivityIndicator
            style={{ marginTop: tokens.spacing._10 }}
            size="large"
            color={tokens.colors.primary}
          />
        ) : (
          <>
            {roomDevices?.length > 0 ? (
              // Show devices list if devices are added
              <FlatList
                data={roomDevices}
                keyExtractor={(_, index) => index.toString()}
                renderItem={({ item }) => {
                  const nodeRef = item.node.deref();
                  return nodeRef ? (
                    <DeviceCard
                      node={nodeRef}
                      device={item}
                      key={nodeRef.id + item.name}
                    />
                  ) : null;
                }}
                contentContainerStyle={styles.deviceList}
                showsVerticalScrollIndicator={false}
                numColumns={1}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    colors={[tokens.colors.primary]}
                    tintColor={tokens.colors.primary}
                    progressViewOffset={10}
                  />
                }
              />
            ) : (
              // Show add your first device banner if no devices are added
              <ScrollView
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    colors={[tokens.colors.primary]}
                    tintColor={tokens.colors.primary}
                    progressViewOffset={10}
                  />
                }
              >
                <AddYourFirstDeviceBanner
                  redirectOperations={redirectOperations}
                />
              </ScrollView>
            )}
          </>
        )}
      </ScreenWrapper>

      {/* HomeTooltip positioned absolutely at screen level */}
      <HomeTooltip
        visible={tooltipVisible}
        onClose={() => setTooltipVisible(false)}
        anchorPosition={tooltipPosition}
        selectedHome={selectedHome}
        homeList={homeList}
        onSelectHome={handleHomeSelect}
      />
    </>
  );
};

const styles = StyleSheet.create({
  gradientBackground: {
    flex: 1,
  },
  screenContainer: {
    flex: 1,
    backgroundColor: tokens.colors.bg5,
  },
  deviceList: {
    flexGrow: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingBottom: 100,
  },
  noDeviceContainer: {
    marginTop: tokens.spacing._15,
    padding: tokens.spacing._20,
  },
  noDeviceDesc: {
    marginBottom: tokens.spacing._20,
    color: tokens.colors.text_primary,
  },
});

export default observer(HomeScreen);
