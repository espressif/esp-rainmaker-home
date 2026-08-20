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
import { useExitAppConfirmation } from "@shared/hooks/useExitAppConfirmation";
import { getFeatures } from "@/config/features.config";
import { ALL_DEVICES_TAB_ID, HOME_REDIRECT_ADD_DEVICE } from "@features/group/utils/constants";

// Components
import {
  Header,
  Tabs,
  ScreenWrapper,
  ConfirmationDialog,
} from "@shared/components";
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
  HomeDeviceSkeletonList,
} from "@features/group/components";
import { testProps } from "@shared/utils/testProps";

/**
 * Home Screen – first screen after login.
 * Banner stays visible (dropdown shows a small skeleton while the home name
 * loads; once a name exists the dropdown unlocks even if `isLoading` is still
 * true). Device skeletons stay until init sync settles for the current home
 * (or devices are already in CDF); empty CTA only after that — avoids a
 * false "no device" flash before nodes arrive.
 */
const HomeScreen = () => {
  const { t } = useTranslation();
  const {
    isLoading,
    isNavigatingToAddDevice,
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

  // Login clears the pre-auth stack, so Home is the bottom of it — back here
  // leaves the app. Confirm rather than dropping the user to the launcher.
  const { isExitDialogOpen, confirmExit, cancelExit } =
    useExitAppConfirmation();

  const isRoomSelected = useMemo(
    () => selectedRoom.id !== ALL_DEVICES_TAB_ID,
    [selectedRoom.id],
  );

  const showGroupControlOnHome =
    controlGroupsEnabled &&
    controlGroups.length > 0 &&
    !isRoomSelected;

  const listDevices = isRoomSelected ? filteredRoomDevices : roomDevices;

  /** Device/room card skeletons while initializing and the list is still empty. */
  const showDeviceSkeleton =
    isLoading &&
    listDevices.length === 0 &&
    !showGroupControlOnHome;

  const listHeader = (
    <>
      <Banner
        activeGroup={selectedHome}
        onDropdownPress={handleDropdownPress}
        image={require("@assets/images/home.png")}
        isHomeNameLoading={isLoading && !selectedHome?.name}
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
    listDevices.length === 0 &&
    !showGroupControlOnHome;

  /** Block add-device until home init finishes and a home is selected. */
  const isAddDeviceDisabled =
    isLoading || isNavigatingToAddDevice || !selectedHome;

  /** Header spinner while home init or add-device navigation is in flight. */
  const showHeaderSpinner = isLoading || isNavigatingToAddDevice;

  /** Skeleton device rows, empty CTA, or null — always inside the FlatList. */
  const listEmpty = showDeviceSkeleton ? (
    <HomeDeviceSkeletonList />
  ) : showEmptyCta ? (
    <AddYourFirstDeviceBanner
      redirectOperations={redirectOperations}
      isNavigating={isNavigatingToAddDevice}
      qaId="banner_add_first_device"
    />
  ) : null;

  return (
    <>
      <Header
        label={t("group.home.title")}
        showBack={false}
        rightSlot={
          showHeaderSpinner ? (
            <View
              {...testProps("activity_indicator_home_header")}
              style={{
                minWidth: 44,
                minHeight: 44,
                justifyContent: "center",
                alignItems: "flex-end",
              }}
            >
              <ActivityIndicator
                size="small"
                color={tokens.colors.primary}
              />
            </View>
          ) : (
            <Pressable
              {...testProps("button_add_device_header")}
              disabled={isAddDeviceDisabled}
              hitSlop={12}
              style={{
                minWidth: 44,
                minHeight: 44,
                justifyContent: "center",
                alignItems: "flex-end",
              }}
              onPress={() => {
                if (isAddDeviceDisabled) return;
                redirectOperations(HOME_REDIRECT_ADD_DEVICE);
              }}
            >
              <Plus
                size={24}
                color={
                  isAddDeviceDisabled
                    ? tokens.colors.gray
                    : tokens.colors.primary
                }
              />
            </Pressable>
          )
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

      <ConfirmationDialog
        open={isExitDialogOpen}
        title={t("layout.shared.exitAppTitle")}
        description={t("layout.shared.exitAppMessage")}
        confirmText={t("layout.shared.exitAppConfirm")}
        cancelText={t("layout.shared.cancel")}
        onConfirm={confirmExit}
        onCancel={cancelExit}
        confirmColor={tokens.colors.red}
        qaId="exit_app"
      />
    </>
  );
};

export default observer(HomeScreen);
