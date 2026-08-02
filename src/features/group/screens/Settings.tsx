/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { Header, ScreenWrapper } from "@shared/components";
import {
  AddUserModal,
  HomeName,
  GroupSharing,
  HomeRemove,
  SettingsRoomSection,
} from "@features/group/components";
import { useToast } from "@shared/hooks/useToast";
import { useSettings, type UseSettingsOptions } from "@features/group/hooks";
import { getFeatures } from "@/config/features.config";

/**
 * Settings screen – UI / presentation layer.
 * Composes Group and HomeSettings components; business logic in useSettings and utils/group.
 */
const Setting = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const {
    home,
    homeName,
    setHomeName,
    isPrimary,
    isSubgroupOnlyViewer,
    showRoomManagement,
    showGroupSharing,
    canRenameHome,
    isLoading,
    showDelete,
    setShowDelete,
    sharedUsers,
    pendingUsers,
    sharedByUser,
    isAddingUser,
    setIsAddingUser,
    newUserEmail,
    makePrimary,
    setMakePrimary,
    transfer,
    setTransfer,
    transferAndAssignRole,
    setTransferAndAssignRole,
    isAddingUserLoading,
    removeUserLoading,
    handleHomeNameUpdate,
    handleRemoveHome,
    handleRoom,
    handleControlGroups,
    handleAddUser,
    handleRemoveUser,
    handleRemovePendingUser,
    handleCloseAddUserModal,
    handleInviteChange,
    inviteValidator,
    isInviteValid,
  } = useSettings({
    homeId: id,
    toast,
    t,
    router: router as UseSettingsOptions["router"],
  });

  const { groupSharing: groupSharingEnabled, controlGroups: controlGroupsEnabled } =
    getFeatures();

  return (
    <>
      <Header label={home?.name ?? ""} showBack={true} qaId="header_settings" />
      <ScreenWrapper
        style={globalStyles.settingsScreenWrapper}
        excludeTop={true}
        qaId="screen_wrapper_settings"
      >
        <HomeName
          homeName={homeName}
          setHomeName={setHomeName}
          onSave={handleHomeNameUpdate}
          isSaving={isLoading}
          isPrimary={canRenameHome}
          disabled={!canRenameHome}
        />

        {showRoomManagement && (
          <SettingsRoomSection
            title={t("group.settings.roomManagement")}
            onPress={handleRoom}
            qaId="section_room_management"
          />
        )}
        {isPrimary && controlGroupsEnabled && (
          <SettingsRoomSection
            title={t("group.settings.groupManagement")}
            onPress={handleControlGroups}
            qaId="section_group_management"
          />
        )}

        {groupSharingEnabled && showGroupSharing && (
          <GroupSharing
            sharedUsers={sharedUsers}
            pendingUsers={pendingUsers}
            sharedByUser={sharedByUser}
            onRemoveUser={handleRemoveUser}
            onRemovePendingUser={handleRemovePendingUser}
            onAddUser={() => setIsAddingUser(true)}
            isPrimaryUser={isPrimary}
            isLoading={removeUserLoading || isAddingUserLoading}
          />
        )}

        {!isSubgroupOnlyViewer && (
          <HomeRemove
            onRemove={handleRemoveHome}
            isLoading={isLoading}
            showDelete={showDelete}
            setShowDelete={setShowDelete}
            isPrimary={isPrimary}
          />
        )}

        {groupSharingEnabled && (
          <AddUserModal
            visible={isAddingUser}
            onClose={handleCloseAddUserModal}
            onAdd={handleAddUser}
            email={newUserEmail}
            handleInviteChange={handleInviteChange}
            isLoading={isAddingUserLoading}
            inviteValidator={inviteValidator}
            isInviteValid={isInviteValid}
            makePrimary={makePrimary}
            onMakePrimaryChange={setMakePrimary}
            transfer={transfer}
            onTransferChange={setTransfer}
            transferAndAssignRole={transferAndAssignRole}
            onTransferAndAssignRoleChange={setTransferAndAssignRole}
          />
        )}
      </ScreenWrapper>
    </>
  );
};

export default Setting;
