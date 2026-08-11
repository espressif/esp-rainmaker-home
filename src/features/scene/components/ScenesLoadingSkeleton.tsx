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
  SCENE_SKELETON_CARD_SIZE,
  SCENE_SKELETON_COUNT,
} from "@features/scene/utils/constants";

/**
 * Grid of square scene-card skeletons for the Scenes list initial load.
 */
export const ScenesLoadingSkeleton: React.FC = () => (
  <View
    {...testProps("view_scenes_loading_skeleton")}
    style={styles.grid}
  >
    {Array.from({ length: SCENE_SKELETON_COUNT }, (_, index) => (
      <Skeleton
        key={`scene_skeleton_${index}`}
        isLoading
        animationType={SKELETON_ANIMATION_PULSE}
        boneColor={tokens.colors.bg1}
        highlightColor={tokens.colors.bg}
        containerStyle={[
          globalStyles.sceneCard,
          globalStyles.sceneCardVertical,
          styles.card,
          {
            width: SCENE_SKELETON_CARD_SIZE,
            height: SCENE_SKELETON_CARD_SIZE,
          },
        ]}
        layout={[
          {
            key: `scene_fav_${index}`,
            width: 22,
            height: 22,
            borderRadius: 11,
            position: "absolute",
            left: tokens.spacing._5,
            top: tokens.spacing._5,
          },
          {
            key: `scene_title_${index}`,
            width: SCENE_SKELETON_CARD_SIZE * 0.55,
            height: 14,
            borderRadius: tokens.radius.sm,
            position: "absolute",
            left: (SCENE_SKELETON_CARD_SIZE - SCENE_SKELETON_CARD_SIZE * 0.55) / 2,
            top: SCENE_SKELETON_CARD_SIZE / 2 - 7,
          },
          {
            key: `scene_chip_${index}`,
            width: SCENE_SKELETON_CARD_SIZE * 0.65,
            height: 18,
            borderRadius: tokens.radius.sm,
            position: "absolute",
            right: tokens.spacing._5,
            bottom: tokens.spacing._5,
          },
        ]}
      />
    ))}
  </View>
);

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
  },
  card: {
    backgroundColor: tokens.colors.white,
  },
});
