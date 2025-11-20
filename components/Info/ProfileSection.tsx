/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

// Icons
import { ChevronRight } from "lucide-react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Types
interface UserInfo {
  /** User's display name */
  name?: string;
  /** User's username/email */
  username?: string;
}

interface DebugInfo {
  /** Whether app is in development mode */
  isDevelopment: boolean;
  /** Number of debug taps */
  debugTapCount: number;
}

interface ProfileSectionProps {
  /** User information */
  userInfo?: UserInfo;
  /** Press handler */
  onPress: () => void;
  /** Debug information */
  debugInfo?: DebugInfo;
}

const getAvatarLetter = (userInfo?: UserInfo): string => {
  if (userInfo?.name?.trim()) {
    return userInfo.name.charAt(0).toUpperCase();
  }

  if (userInfo?.username?.trim()) {
    return userInfo.username.charAt(0).toUpperCase();
  }

  return "U";
};

/**
 * ProfileSection
 *
 * A component for displaying user profile information.
 * Features:
 * - Avatar with initials (smart fallback logic)
 * - User name and username display
 * - Press interaction
 * - Debug mode indicator
 * - Consistent styling
 */
const ProfileSection: React.FC<ProfileSectionProps> = ({
  userInfo,
  onPress,
  debugInfo,
}) => {
  return (
    <Pressable
      onPress={onPress}
      style={[globalStyles.settingsSection, styles.profileContainer]}
    >
      <View style={styles.avatarContainer}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getAvatarLetter(userInfo)}</Text>
        </View>
      </View>

      <View style={[globalStyles.flex1, styles.userInfoContainer]}>
        {userInfo?.name ? (
          <>
            <Text style={[globalStyles.fontMedium, styles.userName]}>
              {userInfo.name}
            </Text>
            <Text style={[globalStyles.fontRegular, styles.userEmail]}>
              {userInfo.username}
            </Text>
          </>
        ) : (
          <Text style={[globalStyles.fontMedium, styles.userName]}>
            {userInfo?.username}
          </Text>
        )}

        {debugInfo?.isDevelopment && debugInfo.debugTapCount > 0 && (
          <Text style={[globalStyles.fontRegular, styles.debugCounter]}>
            Debug: {debugInfo.debugTapCount}/7
          </Text>
        )}
      </View>

      <ChevronRight size={20} color={tokens.colors.primary} />
    </Pressable>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  profileContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: tokens.spacing._15,
    paddingHorizontal: tokens.spacing._15,
    borderWidth: tokens.border.defaultWidth,
    borderColor: tokens.colors.borderColor,
    shadowColor: tokens.colors.primary,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.md,
  },
  avatarContainer: {
    marginRight: tokens.spacing._15,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: tokens.colors.bg3,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: tokens.fontSize.lg,
    color: tokens.colors.white,
  },
  userInfoContainer: {
    flex: 1,
  },
  userName: {
    fontSize: tokens.fontSize.md,
    color: tokens.colors.black,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.bg3,
  },
  debugCounter: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.blue,
    marginTop: 2,
  },
});

export default ProfileSection;
