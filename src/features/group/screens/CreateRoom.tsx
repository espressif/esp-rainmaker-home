/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet } from "react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { Header, ScreenWrapper, ConfirmationDialog } from "@shared/components";
import {
  CreateRoomNameSection,
  CreateRoomDeviceSection,
  CreateRoomFooter,
  GroupSharing,
  AddUserModal,
  RoomLeave,
} from "@features/group/components";
import { testProps } from "@shared/utils/testProps";
import { useToast } from "@shared/hooks/useToast";
import {
  useCreateRoom,
  type UseCreateRoomOptions,
} from "@features/group/hooks";
import { getFeatures } from "@config/features.config";
import { firstRouteParam, parseRouteParamBoolean } from "@shared/utils/common";

/**
 * Create Room screen – UI / presentation layer.
 * Composes Group components; business logic in useCreateRoom and utils/group.
 */
const CreateRoom = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const raw = useLocalSearchParams<{
    roomName?: string | string[];
    id?: string | string[];
    roomId?: string | string[];
    dismissTo?: string | string[];
    nodeId?: string | string[];
    showSelection?: string | string[];
    settingsDevice?: string | string[];
  }>();

  const paramRoomName = firstRouteParam(raw.roomName);
  const id = firstRouteParam(raw.id);
  const roomId = firstRouteParam(raw.roomId);
  const dismissTo = firstRouteParam(raw.dismissTo);
  const nodeIdStr = firstRouteParam(raw.nodeId);
  const settingsDeviceParam = firstRouteParam(raw.settingsDevice);
  const showSelection = parseRouteParamBoolean(
    firstRouteParam(raw.showSelection),
    true
  );

  const {
    roomName,
    room,
    canManageRoom,
    canEditRoomDevices,
    canLeaveRoom,
    showLeaveDialog,
    setShowLeaveDialog,
    isLeavingRoom,
    confirmLeaveRoom,
    selectedNodes,
    availableNodes,
    isLoading,
    showDeleteDialog,
    setShowDeleteDialog,
    handleCustomRoomName,
    handleAddDevice,
    handleRemoveDevice,
    handleSave,
    handleUpdate,
    handleDelete,
    confirmDelete,
    isRoomSharePrimary,
    roomSharedUsers,
    roomPendingUsers,
    roomSharedByUser,
    isAddingRoomUser,
    setIsAddingRoomUser,
    newRoomUserInvite,
    makeRoomUserPrimary,
    setMakeRoomUserPrimary,
    transferRoom,
    setTransferRoom,
    transferRoomAndAssignRole,
    setTransferRoomAndAssignRole,
    isAddingRoomUserLoading,
    removeRoomUserLoading,
    handleAddRoomUser,
    handleRemoveRoomUser,
    handleRemoveRoomPendingUser,
    handleCloseAddRoomUserModal,
    handleRoomInviteChange,
    roomInviteValidator,
    isRoomInviteValid,
  } = useCreateRoom({
    homeId: id,
    roomId,
    paramRoomName,
    dismissTo,
    nodeId: nodeIdStr,
    showSelection,
    settingsDeviceParam,
    toast,
    t,
    router: router as UseCreateRoomOptions["router"],
  });

  const subGroupSharingEnabled = getFeatures().subGroupSharing;

  return (
    <>
      <Header
        label={
          room
            ? t("group.createRoom.editRoom")
            : t("group.createRoom.createRoom")
        }
        showBack={true}
        qaId="header_create_room"
      />
      <ScreenWrapper
        style={StyleSheet.flatten([
          globalStyles.container,
          globalStyles.createRoomScreenContainer,
        ])}
        qaId="screen_wrapper_create_room"
      >
        <ScrollView
          style={globalStyles.createRoomScrollContainer}
          contentContainerStyle={globalStyles.createRoomScrollContent}
          showsVerticalScrollIndicator={false}
          {...testProps("scroll_create_room")}
        >
          <CreateRoomNameSection
            title={t("group.createRoom.roomName")}
            value={roomName}
            placeholder={t("group.createRoom.addCustomizedRoom")}
            onPress={handleCustomRoomName}
          />

          {showSelection && canEditRoomDevices && (
            <>
              <CreateRoomDeviceSection
                title={t("group.createRoom.existingDevice")}
                devices={selectedNodes}
                emptyLabel={t("group.createRoom.pleaseSelectDevices")}
                showPlus={false}
                showMinus={true}
                onDevicePress={handleRemoveDevice}
                qaId="existing_devices_create_room"
                viewTestId="view_existing_devices_create_room"
                placeholderTestId="text_select_devices_create_room"
              />
              <CreateRoomDeviceSection
                title={t("group.createRoom.addDevice")}
                devices={availableNodes}
                emptyLabel={t("group.createRoom.noMoreDevicesAvailable")}
                showPlus={true}
                showMinus={false}
                onDevicePress={handleAddDevice}
                qaId="add_devices_create_room"
                viewTestId="view_add_devices_create_room"
                listTestId="view_create_room"
                placeholderTestId="text_create_room"
              />
            </>
          )}

          {subGroupSharingEnabled && room && (
            <GroupSharing
              sharedUsers={roomSharedUsers}
              pendingUsers={roomPendingUsers}
              sharedByUser={roomSharedByUser}
              onRemoveUser={handleRemoveRoomUser}
              onRemovePendingUser={handleRemoveRoomPendingUser}
              onAddUser={() => setIsAddingRoomUser(true)}
              isPrimaryUser={isRoomSharePrimary}
              isLoading={
                removeRoomUserLoading || isAddingRoomUserLoading
              }
              containerStyle={{ marginTop: tokens.spacing._15 }}
            />
          )}

          {canLeaveRoom && (
            <RoomLeave
              onLeave={confirmLeaveRoom}
              isLoading={isLeavingRoom}
              showLeave={showLeaveDialog}
              setShowLeave={setShowLeaveDialog}
            />
          )}

          <CreateRoomFooter
            saveLabel={t("layout.shared.save")}
            deleteLabel={t("layout.shared.delete")}
            saveDisabled={isLoading.save || !roomName}
            deleteDisabled={isLoading.delete}
            saveLoading={isLoading.save}
            deleteLoading={isLoading.delete}
            showDelete={!!room && canManageRoom}
            onSave={room ? handleUpdate : handleSave}
            onDelete={handleDelete}
          />
        </ScrollView>

        {subGroupSharingEnabled && room && (
          <AddUserModal
            visible={isAddingRoomUser}
            onClose={handleCloseAddRoomUserModal}
            onAdd={handleAddRoomUser}
            email={newRoomUserInvite}
            handleInviteChange={handleRoomInviteChange}
            isLoading={isAddingRoomUserLoading}
            inviteValidator={roomInviteValidator}
            isInviteValid={isRoomInviteValid}
            makePrimary={makeRoomUserPrimary}
            onMakePrimaryChange={setMakeRoomUserPrimary}
            transfer={transferRoom}
            onTransferChange={setTransferRoom}
            transferAndAssignRole={transferRoomAndAssignRole}
            onTransferAndAssignRoleChange={setTransferRoomAndAssignRole}
            showRoleOptions={false}
          />
        )}
      </ScreenWrapper>

      <ConfirmationDialog
        open={showDeleteDialog}
        title={t("group.createRoom.confirmRemoveRoom")}
        description={t("group.createRoom.confirmRemoveRoomMessage")}
        confirmText={t("layout.shared.remove")}
        cancelText={t("layout.shared.cancel")}
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteDialog(false)}
        confirmColor={tokens.colors.red}
        isLoading={isLoading.delete}
        qaId="remove_room"
      />
    </>
  );
};

export default CreateRoom;
