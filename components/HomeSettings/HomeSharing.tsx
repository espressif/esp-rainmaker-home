/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
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
import { CollapsibleCard, ActionButton } from "@/components";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";
import { HomeSharingProps } from "@/types/global";

/**
 * HomeSharing Component
 *
 * Manages home sharing with other users following the "Sharing Only" card design.
 * Displays pending and accepted users in separate sections.
 *
 * Features:
 * - "Sharing Only" card layout
 * - Pending for Acceptance section (conditional)
 * - Shared With section (conditional)
 * - Add User functionality
 * - Remove user functionality
 * - Excludes primary user from lists
 *
 * @param props - Component properties for home sharing functionality
 */
const HomeSharing: React.FC<HomeSharingProps> = ({
  sharedUsers,
  pendingUsers,
  sharedByUser,
  onRemoveUser,
  onRemovePendingUser,
  onAddUser,
  isPrimaryUser,
  isLoading,
}) => {
  const { t } = useTranslation();

  if (!isPrimaryUser) {
    return (
      <CollapsibleCard
        title={t("group.settings.homeShareByTitle")}
        defaultExpanded={false}
        showItemCount={false}
        description={sharedByUser?.username || ""}
        style={styles.contentWrapper}
        isExpandable={false}
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
      style={styles.contentWrapper}
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
        <View style={{ marginBottom: tokens.spacing._15 }}>
          <Text
            style={{
              fontWeight: 500,
              fontFamily: tokens.fonts.medium,
              marginBottom: tokens.spacing._10,
            }}
          >
            {t("group.settings.homeSharingPendingForAcceptance")}
          </Text>
          {pendingUsers.map((user, index) => (
            <View key={user.id || index} style={globalStyles.userItem}>
              <View style={globalStyles.userInfo}>
                <Text style={globalStyles.userEmail}>{user.username}</Text>
                {user.expirationMessage && (
                  <Text
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
                style={globalStyles.removeButton}
                onPress={() => onRemovePendingUser?.(user.username)}
              >
                <X size={16} color={tokens.colors.red} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* Shared With Section */}
      {sharedUsers && sharedUsers.length > 0 && (
        <View>
          <Text
            style={{
              fontWeight: 500,
              fontFamily: tokens.fonts.medium,
              marginBottom: tokens.spacing._10,
            }}
          >
            {t("group.settings.homeSharingSharedWith")}
          </Text>
          {sharedUsers.map((user, index) => (
            <View key={user.id || index} style={globalStyles.userItem}>
              <View style={globalStyles.userInfo}>
                <Text style={globalStyles.userEmail}>{user.username}</Text>
              </View>
              <Pressable
                style={globalStyles.removeButton}
                onPress={() => onRemoveUser(user.username)}
              >
                <X size={16} color={tokens.colors.red} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </CollapsibleCard>
  );
};

export default HomeSharing;

const styles = StyleSheet.create({
  contentWrapper: {
    backgroundColor: tokens.colors.white,
    ...globalStyles.shadowElevationForLightTheme,
  },
});
