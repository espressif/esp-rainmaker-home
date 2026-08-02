/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Plus } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";

// Hooks
import { useTranslation } from "react-i18next";
import { observer } from "mobx-react-lite";
import { useHomeScreen } from "@features/group/hooks";
import { getFeatures } from "@/config/features.config";
import { ALL_DEVICES_TAB_ID } from "@features/group/utils/constants";

// Components
import { Header, Tabs, ScreenWrapper } from "@shared/components";
import {
  Banner,
  FloatingChatButton,
  HomeDeviceList,
  HomeGroupControlList,
  HomeTooltip,
  MigrationPromptModal,
  DeviceTypeFilterTabs,
  RoomControlSwitch,
  AddYourFirstDeviceBanner,
} from "@features/group/components";
import { testProps } from "@shared/utils/testProps";

/**
 * Home Screen – first screen after login.
 * Banner, tabs, filters, and lists share one FlatList so pull-to-refresh works
 * from anywhere on the scroll surface (not only over device cards).
 */
const HomeScreen = () => {
  const { t } = useTranslation();
  const {
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
  } = useHomeScreen();

  const { controlGroups: controlGroupsEnabled, aiAgent: aiAgentEnabled } =
    getFeatures();

  const isRoomSelected = useMemo(
    () => selectedRoom.id !== ALL_DEVICES_TAB_ID,
    [selectedRoom.id],
  );

  const showGroupControlOnHome =
    controlGroupsEnabled &&
    controlGroups.length > 0 &&
    !isRoomSelected;

  const listDevices = isLoading
    ? []
    : isRoomSelected
      ? filteredRoomDevices
      : roomDevices;

  const listHeader = (
    <>
      <Banner
        activeGroup={selectedHome}
        onDropdownPress={handleDropdownPress}
        image={require("@assets/images/home.png")}
      />
      <Tabs
        tabs={roomTabs}
        activeTab={selectedRoom}
        onSelectTab={(tab) => setSelectedRoom(tab)}
      />
      {isRoomSelected && (
        <DeviceTypeFilterTabs
          roomDevices={roomDevices}
          activeFilter={selectedDeviceTypeFilter}
          onSelectFilter={setSelectedDeviceTypeFilter}
        />
      )}
      {showGroupControlOnHome && (
        <HomeGroupControlList
          groups={controlGroups}
          homeId={selectedHome?.id ?? ""}
        />
      )}
      {isRoomSelected && (
        <RoomControlSwitch
          filteredDevices={filteredRoomDevices}
          roomGroup={selectedRoomGroup}
        />
      )}
    </>
  );

  const showEmptyCta =
    !isLoading &&
    (roomDevices?.length ?? 0) === 0 &&
    !showGroupControlOnHome;

  /** Loading spinner or empty CTA — always inside the refreshed FlatList. */
  const listEmpty = isLoading ? (
    <ActivityIndicator
      {...testProps("activity_indicator_home")}
      style={globalStyles.homeActivityIndicator}
      size="large"
      color={tokens.colors.primary}
    />
  ) : showEmptyCta ? (
    <AddYourFirstDeviceBanner
      redirectOperations={redirectOperations}
      qaId="banner_add_first_device"
    />
  ) : null;

  return (
    <>
      <Header
        label={t("group.home.title")}
        showBack={false}
        rightSlot={
          <Pressable
            {...testProps("button_add_device_header")}
            onPress={() => redirectOperations("AddDevice")}
          >
            <Plus size={24} color={tokens.colors.primary} />
          </Pressable>
        }
        qaId="header_home"
      />
      <ScreenWrapper
        style={globalStyles.homeScreenContainer}
        qaId="screen_wrapper_home"
        excludeTop={true}
        dismissKeyboard={false}
      >
        <View
          {...testProps("view_home_devices_and_groups")}
          style={globalStyles.flex1}
        >
          <HomeDeviceList
            roomDevices={listDevices}
            refreshing={refreshing}
            onRefresh={onRefresh}
            listHeader={listHeader}
            listEmpty={listEmpty}
          />
        </View>
      </ScreenWrapper>

      {aiAgentEnabled && <FloatingChatButton />}

      <HomeTooltip
        visible={tooltipVisible}
        onClose={handleCloseTooltip}
        anchorPosition={tooltipPosition}
        selectedHome={selectedHome}
        homeList={homeList}
        onSelectHome={handleHomeSelect}
      />

      <MigrationPromptModal
        visible={showMigrationPrompt}
        onUnderstood={handleMigrationPromptUnderstood}
        title={t("group.home.migrationPromptTitle")}
        message={t("group.home.migrationPromptMessage")}
        buttonLabel={t("group.home.migrationPromptUnderstood")}
      />
    </>
  );
};

export default observer(HomeScreen);
