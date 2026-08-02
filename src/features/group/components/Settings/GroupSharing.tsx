/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Text,
  View,
  Pressable,
  StyleSheet,
} from "react-native";
import { UserPlus, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";

// Components
import { CollapsibleCard, ActionButton, ConfirmationDialog } from "@shared/components";

import {
  GROUP_SHARING_REVOKE_PENDING,
  GROUP_SHARING_REVOKE_SHARED,
  type GroupSharingRevokeKind,
} from "@/src/features/group/utils/constants";

// Styles
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";
import type { GroupSharedUser, GroupSharingProps } from "@src/types/global";

/**
 * GroupSharing Component
 *
 * Manages group (home or subgroup) sharing with other users using the sharing card design.
 * Displays pending and accepted users in separate sections.
 *
 * Features:
 * - Sharing card layout
 * - Pending for Acceptance section (conditional)
 * - Shared With section (conditional)
 * - Add User functionality
 * - Remove user functionality (with confirmation)
 * - Excludes primary user from lists
 * @param props - Component properties for group sharing functionality
 */
const GroupSharing: React.FC<GroupSharingProps> = ({
  sharedUsers,
  pendingUsers,
  sharedByUser,
  onRemoveUser,
  onRemovePendingUser,
  onAddUser,
  isPrimaryUser,
  isLoading,
  containerStyle,
}) => {
  const { t } = useTranslation();

  const [revokeTarget, setRevokeTarget] = useState<{
    kind: GroupSharingRevokeKind;
    username: string;
  } | null>(null);

  /**
   * Handler that opens the revoke confirmation dialog for a pending invite or an accepted member.
   */
  const handleOpenRevokeDialog = useCallback(
    (kind: GroupSharingRevokeKind, username: string) => {
      setRevokeTarget({ kind, username });
    },
    []
  );

  /**
   * Runs the store remove/revoke action after confirmation, then closes the dialog.
   */
  const handleConfirmRevoke = useCallback(async () => {
    if (!revokeTarget) return;
    const { kind, username } = revokeTarget;
    try {
      if (kind === GROUP_SHARING_REVOKE_PENDING && onRemovePendingUser) {
        await onRemovePendingUser(username);
      } else if (kind === GROUP_SHARING_REVOKE_SHARED) {
        await onRemoveUser(username);
      }
    } finally {
      setRevokeTarget(null);
    }
  }, [revokeTarget, onRemovePendingUser, onRemoveUser]);

  const dialogTitle =
    revokeTarget === null
      ? ""
      : revokeTarget.kind === GROUP_SHARING_REVOKE_PENDING
        ? t("group.settings.confirmRevokePendingShareTitle")
        : t("group.settings.confirmRemoveSharedUserTitle");

  const dialogDescription =
    revokeTarget === null
      ? ""
      : revokeTarget.kind === GROUP_SHARING_REVOKE_PENDING
        ? t("group.settings.confirmRevokePendingShareMessage", {
            username: revokeTarget.username,
          })
        : t("group.settings.confirmRemoveSharedUserMessage", {
            username: revokeTarget.username,
          });

  const cardStyle = [styles.contentWrapper, containerStyle];

  if (!isPrimaryUser) {
    return (
      <CollapsibleCard
        title={t("group.settings.homeShareByTitle")}
        defaultExpanded={false}
        showItemCount={false}
        description={sharedByUser?.username || ""}
        style={cardStyle}
        isExpandable={false}
        qaId="section_shared_by"
      />
    );
  }

  return (
    <CollapsibleCard
      title={t("group.settings.sharing")}
      defaultExpanded={false}
      showItemCount={true}
      itemCount={(sharedUsers?.length || 0) + (pendingUsers?.length || 0)}
      itemLabel="user"
      style={cardStyle}
      isExpandable={true}
      qaId="section_sharing"
    >
      {/* Add User Button */}
      <ActionButton
        onPress={onAddUser}
        variant="secondary"
        style={{ marginBottom: tokens.spacing._15 }}
        qaId="button_add_user_sharing"
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={tokens.colors.primary} />
        ) : (
          <>
            <UserPlus size={16} color={tokens.colors.primary} />
            <Text style={[globalStyles.buttonTextSecondary, { marginLeft: 8 }]}>
              {t("group.settings.homeSharingButton")}
            </Text>
          </>
        )}
      </ActionButton>

      {/* Pending for Acceptance Section */}
      {pendingUsers && pendingUsers.length > 0 && (
        <View style={{ marginBottom: tokens.spacing._15 }} {...testProps("view_pending_section")}>
          <Text
            {...testProps("text_title_pending_for_acceptance")}
            style={{
              fontWeight: 500,
              fontFamily: tokens.fonts.medium,
              marginBottom: tokens.spacing._10,
            }}
          >
            {t("group.settings.homeSharingPendingForAcceptance")}
          </Text>
          {pendingUsers.map((user: GroupSharedUser, index: number) => (
            <View
              key={user.id || index}
              {...testProps(`view_pending_users`)}
              style={globalStyles.userItem}
            >
              <View style={globalStyles.userInfo} {...testProps("view_pending_user_info")}>
                <Text style={globalStyles.userEmail} {...testProps("text_pending_user_name")}>{user.username}</Text>
                {user.expirationMessage && (
                  <Text
                    {...testProps("text_pending_user_expiration_message")}
                    style={[
                      globalStyles.userEmail,
                      {
                        fontSize: tokens.fontSize.sm,
                        color: tokens.colors.gray,
                        marginTop: 2,
                      },
                    ]}
                  >
                    {user.expirationMessage}
                  </Text>
                )}
              </View>
              <Pressable
                {...testProps("button_remove_pending_user")}
                style={globalStyles.removeButton}
                onPress={() =>
                  handleOpenRevokeDialog(GROUP_SHARING_REVOKE_PENDING, user.username)
                }
              >
                <X size={16} color={tokens.colors.red} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* Shared With Section */}
      {sharedUsers && sharedUsers.length > 0 && (
        <View {...testProps("view_shared_with_section")}>
          <Text
            {...testProps("text_title_shared_with")}
            style={{
              fontWeight: 500,
              fontFamily: tokens.fonts.medium,
              marginBottom: tokens.spacing._10,
            }}
          >
            {t("group.settings.homeSharingSharedWith")}
          </Text>
          {sharedUsers.map((user: GroupSharedUser, index: number) => (
            <View
              key={user.id || index}
              {...testProps("view_shared_with_users")}
              style={globalStyles.userItem}
            >
              <View style={globalStyles.userInfo} {...testProps("view_shared_with_user_info")}>
                <Text style={globalStyles.userEmail} {...testProps("text_shared_with_username")}>{user.username}</Text>
              </View>
              <Pressable
                {...testProps("button_remove_shared_with_user")}
                style={globalStyles.removeButton}
                onPress={() =>
                  handleOpenRevokeDialog(GROUP_SHARING_REVOKE_SHARED, user.username)
                }
              >
                <X size={16} color={tokens.colors.red} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <ConfirmationDialog
        open={revokeTarget !== null}
        title={dialogTitle}
        description={dialogDescription}
        confirmText={t("layout.shared.remove")}
        cancelText={t("layout.shared.cancel")}
        onConfirm={() => {
          void handleConfirmRevoke();
        }}
        onCancel={() => setRevokeTarget(null)}
        confirmColor={tokens.colors.red}
        isLoading={isLoading}
        qaId="revoke_group_sharing"
      />
    </CollapsibleCard>
  );
};

export default GroupSharing;

const styles = StyleSheet.create({
  contentWrapper: {
    backgroundColor: tokens.colors.white,
    ...globalStyles.shadowElevationForLightTheme,
  },
});
