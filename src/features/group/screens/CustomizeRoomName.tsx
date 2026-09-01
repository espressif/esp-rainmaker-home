/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, Pressable } from "react-native";

// Styles
import { globalStyles } from "@shared/theme/globalStyleSheet";

// Hooks
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCustomizeRoomName } from "@features/group/hooks";

// Components
import {
  Header,
  ContentWrapper,
  ScreenWrapper,
  Input,
} from "@shared/components";
import { CustomizeRoomNamePredefinedList } from "@features/group/components";

// Utils
import { testProps } from "@shared/utils/testProps";

/**
 * CustomizeRoomName Screen
 *
 * Allows users to select a predefined room name or create a custom one.
 * Thin orchestration: composes useCustomizeRoomName and Group UI components.
 */
const CustomizeRoomName = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    currentRoomName,
    id,
    roomId,
    dismissTo,
    nodeId,
    showSelection,
    settingsDevice,
  } = useLocalSearchParams<{
    currentRoomName?: string | string[];
    id?: string | string[];
    roomId?: string | string[];
    dismissTo?: string | string[];
    nodeId?: string | string[];
    showSelection?: string | string[];
    settingsDevice?: string | string[];
  }>();

  const {
    selectedRoom,
    roomName,
    predefinedRooms,
    canConfirm,
    handleConfirm,
    handleCustomRoomNameChange,
    handleRoomSelection,
  } = useCustomizeRoomName({
    currentRoomName,
    id,
    roomId,
    dismissTo,
    nodeId,
    showSelection,
    settingsDevice,
    router: router as Parameters<typeof useCustomizeRoomName>[0]["router"],
    t,
  });

  return (
    <>
      <Header label={t("group.customizeRoomName.nameList")} showBack={true} />
      <ScreenWrapper style={globalStyles.customizeRoomNameScreen}>
        <View style={globalStyles.customizeRoomNameCustomSection}>
          <ContentWrapper title={t("group.customizeRoomName.addOwnRoomName")}>
            <Input
              placeholder={t("group.customizeRoomName.roomNamePlaceholder")}
              initialValue={roomName}
              onFieldChange={handleCustomRoomNameChange}
              border={false}
              paddingHorizontal={false}
              marginBottom={false}
              style={globalStyles.customizeRoomNameInput}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (canConfirm) {
                  handleConfirm();
                }
              }}
            />
          </ContentWrapper>
        </View>
        <View style={globalStyles.customizeRoomNamePredefinedContainer}>
          <ContentWrapper
            title={t("group.customizeRoomName.selectExitingRoomName")}
            style={globalStyles.customizeRoomNameScrollView}
            scrollContent={true}
          >
            <CustomizeRoomNamePredefinedList
              rooms={predefinedRooms}
              selectedRoom={selectedRoom}
              onRoomSelect={handleRoomSelection}
            />
          </ContentWrapper>
        </View>

        <View style={globalStyles.customizeRoomNameButtonContainer}>
          <Pressable
            {...testProps("button_confirm_room_name")}
            style={[
              globalStyles.btn,
              globalStyles.bgBlue,
              !canConfirm && globalStyles.customizeRoomNameButtonDisabled,
            ]}
            onPress={handleConfirm}
            disabled={!canConfirm}
          >
            <Text style={[globalStyles.fontMedium, globalStyles.textWhite]}>
              {t("group.customizeRoomName.confirmBtn")}
            </Text>
          </Pressable>
        </View>
      </ScreenWrapper>
    </>
  );
};

export default CustomizeRoomName;
