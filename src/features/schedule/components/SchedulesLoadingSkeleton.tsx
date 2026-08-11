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
  SCHEDULE_SKELETON_CARD_HEIGHT,
  SCHEDULE_SKELETON_COUNT,
} from "@features/schedule/utils/constants";

/**
 * Full-width schedule-card skeletons for the Schedules list initial load.
 */
export const SchedulesLoadingSkeleton: React.FC = () => (
  <View
    {...testProps("view_schedules_loading_skeleton")}
    style={styles.list}
  >
    {Array.from({ length: SCHEDULE_SKELETON_COUNT }, (_, index) => (
      <Skeleton
        key={`schedule_skeleton_${index}`}
        isLoading
        animationType={SKELETON_ANIMATION_PULSE}
        boneColor={tokens.colors.bg1}
        highlightColor={tokens.colors.bg}
        containerStyle={[
          globalStyles.scheduleCard,
          styles.card,
          { height: SCHEDULE_SKELETON_CARD_HEIGHT },
        ]}
        layout={[
          {
            key: `schedule_title_${index}`,
            width: "42%",
            height: 16,
            borderRadius: tokens.radius.sm,
            position: "absolute",
            left: tokens.spacing._10,
            top: tokens.spacing._10,
          },
          {
            key: `schedule_time_${index}`,
            width: 64,
            height: 22,
            borderRadius: tokens.radius.sm,
            position: "absolute",
            right: 62,
            top: tokens.spacing._10,
          },
          {
            key: `schedule_switch_${index}`,
            width: 44,
            height: 26,
            borderRadius: 13,
            position: "absolute",
            right: tokens.spacing._10,
            top: tokens.spacing._10,
          },
          {
            key: `schedule_days_${index}`,
            width: "70%",
            height: 25,
            borderRadius: tokens.radius.sm,
            position: "absolute",
            left: tokens.spacing._10,
            bottom: tokens.spacing._10,
          },
          {
            key: `schedule_count_${index}`,
            width: 56,
            height: 16,
            borderRadius: tokens.radius.sm,
            position: "absolute",
            right: tokens.spacing._10,
            bottom: tokens.spacing._10,
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
    position: "relative",
  },
});
