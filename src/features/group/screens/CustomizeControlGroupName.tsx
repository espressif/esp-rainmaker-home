/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, Pressable } from "react-native";

import { globalStyles } from "@shared/theme/globalStyleSheet";

import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCustomizeControlGroupName } from "@features/group/hooks";

import {
  Header,
  ContentWrapper,
  ScreenWrapper,
  Input,
} from "@shared/components";

import { testProps } from "@shared/utils/testProps";

/**
 * Name entry for device control groups (Create / Edit control group flow).
 */
const CustomizeControlGroupName = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { currentGroupName, id, groupId, preselectedNodeId, dismissTo, settingsDevice } =
    useLocalSearchParams<{
      currentGroupName?: string;
      id?: string;
      groupId?: string;
      preselectedNodeId?: string;
      dismissTo?: string;
      settingsDevice?: string;
    }>();

  const {
    groupName,
    canConfirm,
    handleConfirm,
    handleGroupNameChange,
  } = useCustomizeControlGroupName({
    currentGroupName,
    id,
    groupId,
    preselectedNodeId,
    dismissTo,
    settingsDevice,
    router: router as Parameters<
      typeof useCustomizeControlGroupName
    >[0]["router"],
  });

  return (
    <>
      <Header
        label={t("group.deviceGroups.customizeGroupNameTitle")}
        showBack={true}
        qaId="header_customize_control_group_name"
      />
      <ScreenWrapper
        style={globalStyles.customizeRoomNameScreen}
        qaId="screen_wrapper_customize_control_group_name"
      >
        <View style={globalStyles.customizeRoomNameCustomSection}>
          <ContentWrapper title={t("group.deviceGroups.groupNameField")}>
            <Input
              placeholder={t("group.deviceGroups.groupNamePlaceholder")}
              initialValue={groupName}
              onFieldChange={handleGroupNameChange}
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

        <View style={globalStyles.customizeRoomNameButtonContainer}>
          <Pressable
            {...testProps("button_confirm_control_group_name")}
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

export default CustomizeControlGroupName;
