/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, StyleSheet } from "react-native";
import Skeleton from "react-native-reanimated-skeleton";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";
import { SKELETON_ANIMATION_PULSE } from "@shared/utils/constants";
import {
  AUTOMATION_SKELETON_CARD_HEIGHT,
  AUTOMATION_SKELETON_COUNT,
} from "@features/automation/utils/constants";

/**
 * Full-width automation-card skeletons for the Automations list initial load.
 */
export const AutomationsLoadingSkeleton: React.FC = () => (
  <View
    {...testProps("view_automations_loading_skeleton")}
    style={styles.list}
  >
    {Array.from({ length: AUTOMATION_SKELETON_COUNT }, (_, index) => (
      <Skeleton
        key={`automation_skeleton_${index}`}
        isLoading
        animationType={SKELETON_ANIMATION_PULSE}
        boneColor={tokens.colors.bg1}
        highlightColor={tokens.colors.bg}
        containerStyle={[
          styles.card,
          { height: AUTOMATION_SKELETON_CARD_HEIGHT },
        ]}
        layout={[
          {
            key: `automation_title_${index}`,
            width: "55%",
            height: 16,
            borderRadius: tokens.radius.sm,
            position: "absolute",
            left: tokens.spacing._15,
            top: tokens.spacing._15,
          },
          {
            key: `automation_switch_${index}`,
            width: 44,
            height: 26,
            borderRadius: 13,
            position: "absolute",
            right: tokens.spacing._15,
            top: tokens.spacing._15,
          },
          {
            key: `automation_event_${index}`,
            width: "80%",
            height: 12,
            borderRadius: tokens.radius.sm,
            position: "absolute",
            left: tokens.spacing._15,
            top: 52,
          },
          {
            key: `automation_separator_${index}`,
            width: "90%",
            height: 1,
            borderRadius: 1,
            position: "absolute",
            left: tokens.spacing._15,
            top: 74,
          },
          {
            key: `automation_action_${index}`,
            width: "70%",
            height: 12,
            borderRadius: tokens.radius.sm,
            position: "absolute",
            left: tokens.spacing._15,
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
    padding: tokens.spacing._15,
    marginBottom: tokens.spacing._10,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.borderColor,
    position: "relative",
  },
});
