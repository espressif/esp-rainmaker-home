/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, StyleSheet } from "react-native";
import Skeleton from "react-native-reanimated-skeleton";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";
import { SKELETON_ANIMATION_PULSE } from "@shared/utils/constants";
import { PROFILE_AVATAR_SIZE } from "@features/user/constants";

/**
 * Profile card skeleton matching ProfileSection footprint (avatar + name/email).
 * Shown on My Profile while CDF userInfo is still hydrating.
 * Outer inset comes from ScreenWrapper (`globalStyles.container`); only the
 * card’s own inner bone layout is padded.
 */
export const ProfileLoadingSkeleton: React.FC = () => (
  <View
    {...testProps("view_profile_loading_skeleton")}
    style={[globalStyles.settingsSection, styles.container]}
  >
    <Skeleton
      isLoading
      animationType={SKELETON_ANIMATION_PULSE}
      boneColor={tokens.colors.bg1}
      highlightColor={tokens.colors.bg}
      containerStyle={styles.skeleton}
      layout={[
        {
          key: "profile_avatar",
          width: PROFILE_AVATAR_SIZE,
          height: PROFILE_AVATAR_SIZE,
          borderRadius: PROFILE_AVATAR_SIZE / 2,
          position: "absolute",
          left: tokens.spacing._15,
          top: tokens.spacing._15,
        },
        {
          key: "profile_name",
          width: 120,
          height: 16,
          borderRadius: tokens.radius.sm,
          position: "absolute",
          left: tokens.spacing._15 + PROFILE_AVATAR_SIZE + tokens.spacing._15,
          top: tokens.spacing._15 + 6,
        },
        {
          key: "profile_email",
          width: 160,
          height: 12,
          borderRadius: tokens.radius.sm,
          position: "absolute",
          left: tokens.spacing._15 + PROFILE_AVATAR_SIZE + tokens.spacing._15,
          top: tokens.spacing._15 + 28,
        },
      ]}
    />
  </View>
);

const styles = StyleSheet.create({
  container: {
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
    height: PROFILE_AVATAR_SIZE + tokens.spacing._15 * 2,
    width: "100%",
    overflow: "hidden",
  },
  skeleton: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
});
