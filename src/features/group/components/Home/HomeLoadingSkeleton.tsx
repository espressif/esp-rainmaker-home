/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import Skeleton from "react-native-reanimated-skeleton";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";
import { HOME_DEVICE_SKELETON_COUNT } from "@features/group/utils/constants";
import { SKELETON_ANIMATION_PULSE } from "@shared/utils/constants";

/** Matches DeviceCard / ControlGroupCard footprint on Home. */
const HOME_CARD_SKELETON_HEIGHT = 118;

/**
 * Resolves the same two-column card width DeviceCard uses on Home.
 * @param windowWidth - Current window width
 * @returns Card width in dp
 */
function getHomeCardWidth(windowWidth: number): number {
  if (windowWidth <= 500) {
    return (windowWidth - tokens.spacing._15 * 2) / 2 - 6;
  }
  return 180;
}

/**
 * Two-column skeleton grid matching Home device / control-group cards:
 * avatar + power switch on top, title + subtitle below.
 */
export const HomeDeviceSkeletonList: React.FC = () => {
  const { width } = useWindowDimensions();
  const cardWidth = useMemo(() => getHomeCardWidth(width), [width]);

  return (
    <View
      {...testProps("view_home_device_skeleton_list")}
      style={styles.grid}
    >
      {Array.from({ length: HOME_DEVICE_SKELETON_COUNT }, (_, index) => (
        <Skeleton
          key={`home_device_skeleton_${index}`}
          isLoading
          animationType={SKELETON_ANIMATION_PULSE}
          boneColor={tokens.colors.bg1}
          highlightColor={tokens.colors.bg}
          containerStyle={[
            globalStyles.controlGroupCard,
            globalStyles.shadowElevationForLightTheme,
            styles.card,
            { width: cardWidth, height: HOME_CARD_SKELETON_HEIGHT },
          ]}
          layout={[
            {
              key: `card_avatar_${index}`,
              width: 46,
              height: 46,
              borderRadius: 23,
              position: "absolute",
              left: tokens.spacing._10,
              top: tokens.spacing._10,
            },
            {
              key: `card_switch_${index}`,
              width: 44,
              height: 26,
              borderRadius: 13,
              position: "absolute",
              right: tokens.spacing._10,
              top: tokens.spacing._15,
            },
            {
              key: `card_title_${index}`,
              width: cardWidth - tokens.spacing._10 * 2 - 8,
              height: 14,
              borderRadius: tokens.radius.sm,
              position: "absolute",
              left: tokens.spacing._10 + 5,
              bottom: 32,
            },
            {
              key: `card_subtitle_${index}`,
              width: Math.min(72, cardWidth * 0.4),
              height: 11,
              borderRadius: tokens.radius.sm,
              position: "absolute",
              left: tokens.spacing._10 + 5,
              bottom: tokens.spacing._10,
            },
            {
              key: `card_badge_${index}`,
              width: 16,
              height: 16,
              borderRadius: 4,
              position: "absolute",
              right: tokens.spacing._10,
              bottom: tokens.spacing._10,
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    width: "100%",
  },
  card: {
    padding: tokens.spacing._10,
    backgroundColor: tokens.colors.white,
    marginBottom: tokens.spacing._5,
  },
});
