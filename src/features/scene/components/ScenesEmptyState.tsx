/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useTranslation } from "react-i18next";
import { LayoutPanelLeft, Heart } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";

interface ScenesEmptyStateProps {
  /** When true, shows the "all scenes are favorites" copy instead of no-scenes. */
  hasFavorites: boolean;
  /** True while pull-to-refresh is in progress (fullscreen empty only). */
  refreshing?: boolean;
  /** Pull-to-refresh handler (fullscreen empty only). */
  onRefresh?: () => void;
  /**
   * When true, render only the Pressable content for embedding inside a parent
   * ScrollView (e.g. all-favorites section). When false, owns ScrollView + PTR.
   */
  embedded?: boolean;
}

/**
 * Empty / all-favorites placeholder for scenes.
 * Initial-load skeleton is owned by the Scenes screen reveal transition.
 * @param props - Favorites flag, optional refresh, embedded mode
 * @returns Empty-state UI for scenes
 */
export const ScenesEmptyState = ({
  hasFavorites,
  refreshing = false,
  onRefresh,
  embedded = false,
}: ScenesEmptyStateProps) => {
  const { t } = useTranslation();

  const content = (
    <Pressable
      {...testProps("view_empty_scenes")}
      style={globalStyles.sceneEmptyStateContainer}
    >
      {hasFavorites ? (
        <>
          <View style={globalStyles.sceneEmptyStateIconContainer}>
            <Heart size={35} color={tokens.colors.primary} />
          </View>
          <Text
            {...testProps("text_title_all_favorites")}
            style={globalStyles.sceneEmptyStateTitleLarge}
          >
            {t("scene.scenes.allScenesFavorites")}
          </Text>
          <Text
            {...testProps("text_description_all_favorites")}
            style={globalStyles.emptyStateDescription}
          >
            {t("scene.scenes.allScenesFavoritesDescription")}
          </Text>
        </>
      ) : (
        <>
          <View style={globalStyles.sceneEmptyStateIconContainerTop}>
            <LayoutPanelLeft size={35} color={tokens.colors.primary} />
          </View>
          <Text
            {...testProps("text_title_empty")}
            style={globalStyles.emptyStateTitle}
          >
            {t("scene.scenes.noScenesYet")}
          </Text>
          <Text
            {...testProps("text_description_empty")}
            style={globalStyles.emptyStateDescription}
          >
            {t("scene.scenes.noScenesYetDescription")}
          </Text>
        </>
      )}
    </Pressable>
  );

  if (embedded || !onRefresh) {
    return content;
  }

  return (
    <ScrollView
      {...testProps("scroll_scenes_empty")}
      style={globalStyles.flex1}
      contentContainerStyle={{ flexGrow: 1 }}
      showsVerticalScrollIndicator={false}
      bounces
      alwaysBounceVertical
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[tokens.colors.primary]}
          tintColor={tokens.colors.primary}
          progressViewOffset={10}
        />
      }
    >
      {content}
    </ScrollView>
  );
};
