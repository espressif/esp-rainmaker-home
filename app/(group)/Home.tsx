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
  findPrimaryHome,
  getUnassignedNodes,
  createHome,
  isHome,
} from "@/utils/home";

// types
import { RoomTab, HomeData } from "@/types/global";
import { startNodeLocalDiscovery } from "@/utils/localDiscovery";

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
  const { store, isInitialized: isStoreInitialized } = useCDF();
  const { groupStore, nodeStore, userStore } = store;
  const router = useRouter();

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


  useEffect(() => {
    if (isStoreInitialized) {
      initializeHome();
    }
  }, [isStoreInitialized]);

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
   * Initialize the home screen
   *
   * This function is used to initialize the home screen
   * It gets the group list, selected home and nodes for the selected home
   * It stores the group list, selected home and nodes in local useStates
   *
   * CDF function used:
   * - groupStore.groupList
   * - groupStore.currentHomeId
   * - nodeStore.nodeList
   */
  const initializeHome = useCallback(async () => {
    if (hasInitialized.current) {
      return;
    }
    hasInitialized.current = true;
    const primaryHome = findPrimaryHome(groupStore?.groupList || []);
    // CASE I: No primary home found, create a new one
    // conditions checked
    // 1. no group with home name ( case -insensitive)
    // 2. no group with home type
    // 3. no group with home mutuallyExclusive true
    if (!primaryHome) {
      const nodeIds = getUnassignedNodes(nodeStore?.nodeList, []);
      const primaryHomePayload = createHome(nodeIds) as any;
      await userStore.user?.createGroup(primaryHomePayload);
    }

    const homeList = groupStore?.groupList.filter(isHome);
    const currentHomeId = groupStore.currentHomeId;
    const currentHome = groupStore._groupsByID?.[currentHomeId] || homeList[0];

    if (!groupStore.currentHomeId && currentHome) {
      groupStore.currentHomeId = currentHome.id;
    }

    setHomeList(homeList as ESPRMGroup[]);
    setSelectedHome(currentHome);
    setIsLoading(false);
    hasInitialized.current = false;
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
   * It syncs the node list and group list
   * It initializes the home screen
   *
   * CDF function used:
   * - nodeStore.syncNodeList
   * - groupStore.syncGroupList
   */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await nodeStore?.syncNodeList();
      await groupStore?.syncGroupList();
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
              color={tokens.colors.bg3}
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
