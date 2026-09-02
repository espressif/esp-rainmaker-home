/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { Header, ScreenWrapper, ConfirmationDialog } from "@shared/components";
import {
  CreateRoomNameSection,
  CreateRoomDeviceSection,
  CreateRoomFooter,
} from "@features/group/components";
import { testProps } from "@shared/utils/testProps";
import { useToast } from "@shared/hooks/useToast";
import { useCreateGroup } from "@features/group/hooks";

/**
 * Renders the create control group UI section.
 */
const CreateControlGroup = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const { roomName: roomNameParam, id, groupId, preselectedNodeId, dismissTo, settingsDevice } =
    useLocalSearchParams<{
      roomName?: string;
      id?: string;
      groupId?: string;
      preselectedNodeId?: string;
      dismissTo?: string;
      settingsDevice?: string;
    }>();

  const {
    groupName,
    deviceGroup,
    selectedNodes,
    availableNodes,
    lockedDeviceType,
    isLoading,
    showDeleteDialog,
    setShowDeleteDialog,
    handleCustomizeName,
    handleAddDevice,
    handleRemoveDevice,
    handleSave,
    handleUpdate,
    handleDelete,
    confirmDelete,
  } = useCreateGroup({
    homeId: id,
    groupId,
    roomName: roomNameParam,
    preselectedNodeId,
    dismissTo,
    settingsDeviceParam: settingsDevice,
    toast,
    t,
    router: router as Parameters<typeof useCreateGroup>[0]["router"],
  });

  return (
    <>
      <Header
        label={
          deviceGroup
            ? t("group.deviceGroups.editGroup")
            : t("group.deviceGroups.createGroup")
        }
        showBack={true}
        qaId="header_create_control_group"
      />
      <ScreenWrapper
        style={StyleSheet.flatten([
          globalStyles.container,
          globalStyles.createRoomScreenContainer,
        ])}
        qaId="screen_wrapper_create_control_group"
      >
        <ScrollView
          style={globalStyles.createRoomScrollContainer}
          contentContainerStyle={globalStyles.createRoomScrollContent}
          showsVerticalScrollIndicator={false}
          {...testProps("scroll_create_control_group")}
        >
          <CreateRoomNameSection
            title={t("group.deviceGroups.groupName")}
            value={groupName}
            placeholder={t("group.deviceGroups.addCustomizedGroup")}
            onPress={handleCustomizeName}
            sectionTestId="view_create_control_group_name"
            valueTestId="text_name_control_group"
          />

          {lockedDeviceType ? (
            <View style={{ marginTop: tokens.spacing._10 }}>
              <Text
                style={[
                  globalStyles.fontRegular,
                  { fontSize: tokens.fontSize.xs, color: tokens.colors.bg3 },
                ]}
              >
                {t("group.deviceGroups.lockedTypeHint", {
                  type: lockedDeviceType,
                })}
              </Text>
            </View>
          ) : null}

          <CreateRoomDeviceSection
            title={t("group.createRoom.existingDevice")}
            devices={selectedNodes}
            emptyLabel={t("group.createRoom.pleaseSelectDevices")}
            showPlus={false}
            showMinus={true}
            onDevicePress={handleRemoveDevice}
            qaId="existing_devices_create_control_group"
            viewTestId="view_existing_devices_create_control_group"
            placeholderTestId="text_select_devices_create_control_group"
          />

          <CreateRoomDeviceSection
            title={t("group.createRoom.addDevice")}
            devices={availableNodes}
            emptyLabel={t("group.deviceGroups.noCompatibleDevices")}
            showPlus={true}
            showMinus={false}
            onDevicePress={handleAddDevice}
            qaId="add_devices_create_control_group"
            viewTestId="view_add_devices_create_control_group"
            listTestId="view_create_control_group_devices"
            placeholderTestId="text_create_control_group"
          />

          <CreateRoomFooter
            saveLabel={t("layout.shared.save")}
            deleteLabel={t("layout.shared.delete")}
            saveDisabled={isLoading.save || !groupName || !lockedDeviceType}
            deleteDisabled={isLoading.delete}
            saveLoading={isLoading.save}
            deleteLoading={isLoading.delete}
            showDelete={!!deviceGroup}
            onSave={deviceGroup ? handleUpdate : handleSave}
            onDelete={handleDelete}
          />
        </ScrollView>
      </ScreenWrapper>

      <ConfirmationDialog
        open={showDeleteDialog}
        title={t("group.deviceGroups.confirmRemoveGroup")}
        description={t("group.deviceGroups.confirmRemoveGroupMessage")}
        confirmText={t("layout.shared.remove")}
        cancelText={t("layout.shared.cancel")}
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteDialog(false)}
        confirmColor={tokens.colors.red}
        isLoading={isLoading.delete}
        qaId="remove_control_group"
      />
    </>
  );
};

export default CreateControlGroup;
