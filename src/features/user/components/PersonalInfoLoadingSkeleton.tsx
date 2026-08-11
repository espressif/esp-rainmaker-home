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
import {
  PERSONAL_INFO_SKELETON_CARD_COUNT,
  PERSONAL_INFO_SKELETON_CARD_HEIGHT,
} from "@features/user/constants";

/**
 * Field-card skeletons matching Personal Information ContentWrapper cards
 * while `getUserInfo()` / store hydration is in progress.
 * No outer list padding — ScreenWrapper / personalInfoStyles already inset content.
 */
export const PersonalInfoLoadingSkeleton: React.FC = () => (
  <View
    {...testProps("view_personal_info_loading_skeleton")}
    style={styles.list}
  >
    {Array.from({ length: PERSONAL_INFO_SKELETON_CARD_COUNT }, (_, index) => (
      <Skeleton
        key={`personal_info_skeleton_${index}`}
        isLoading
        animationType={SKELETON_ANIMATION_PULSE}
        boneColor={tokens.colors.bg1}
        highlightColor={tokens.colors.bg}
        containerStyle={[
          globalStyles.shadowElevationForLightTheme,
          styles.card,
          index > 0 && styles.cardSpaced,
          { height: PERSONAL_INFO_SKELETON_CARD_HEIGHT },
        ]}
        layout={[
          {
            key: `personal_info_title_${index}`,
            width: "32%",
            height: 14,
            borderRadius: tokens.radius.sm,
            position: "absolute",
            left: tokens.spacing._15,
            top: tokens.spacing._15,
          },
          {
            key: `personal_info_value_${index}`,
            width: "55%",
            height: 16,
            borderRadius: tokens.radius.sm,
            position: "absolute",
            left: tokens.spacing._15,
            bottom: tokens.spacing._15,
          },
          {
            key: `personal_info_action_${index}`,
            width: 22,
            height: 22,
            borderRadius: 11,
            position: "absolute",
            right: tokens.spacing._15,
            bottom: tokens.spacing._15,
          },
        ]}
      />
    ))}
  </View>
);

const styles = StyleSheet.create({
  list: {
    width: "100%",
  },
  card: {
    width: "100%",
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.md,
    position: "relative",
  },
  cardSpaced: {
    marginTop: tokens.spacing._15,
  },
});
