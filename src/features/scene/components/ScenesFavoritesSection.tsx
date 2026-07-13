/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { ESPCDFScene } from "@store";
import SceneItem from "./SceneItem";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";
import type { SceneLoadingState } from "@src/types/global";

interface ScenesFavoritesSectionProps {
  favoriteScenes: ESPCDFScene[];
  favoriteSceneIds: string[];
  addingFavoriteLoading: string | null;
  sceneCardDimensions: { width: number; height: number; cardsPerRow: number };
  sceneLoadingStates: SceneLoadingState;
  isEditing: boolean;
  onFavoriteToggle: (sceneId: string) => void;
  onScenePress: (scene: ESPCDFScene) => void;
  onSceneAction: (sceneId: string, action: string) => void;
}

/**
 * Favorites section component for scenes screen
 * Displays favorite scenes in a horizontal scrollable list
 */
export const ScenesFavoritesSection = ({
  favoriteScenes,
  favoriteSceneIds,
  addingFavoriteLoading,
  sceneCardDimensions,
  sceneLoadingStates,
  isEditing,
  onFavoriteToggle,
  onScenePress,
  onSceneAction,
}: ScenesFavoritesSectionProps) => {
  const { t } = useTranslation();

  if (favoriteScenes.length === 0) {
    return null;
  }

  return (
    <>
      <View style={[globalStyles.sceneSection, { marginBottom: 0 }]}>
        <Text {...testProps("text_title_favorites")} style={globalStyles.sceneSectionTitle}>
          {t("scene.scenes.favourites")}
        </Text>

        {favoriteScenes.length > 0 && (
          <ScrollView
            {...testProps("scroll_favorites")}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: tokens.spacing._5,
              paddingVertical: 10,
              paddingRight: 100,
            }}
          >
            {favoriteScenes.map((scene) => (
              <SceneItem
                key={scene.id}
                name={scene.name}
                deviceCount={scene.devicesCount}
                devices={[]}
                icon={null}
                variant="horizontal"
                isFavorite={favoriteSceneIds.includes(scene.id)}
                saveFavoriteLoading={addingFavoriteLoading === scene.id}
                onFavoriteToggle={() => onFavoriteToggle(scene.id)}
                onPress={() => onScenePress(scene)}
                sceneCardDimensions={sceneCardDimensions}
                onDelete={() => onSceneAction(scene.id, "delete")}
                deleteLoading={sceneLoadingStates[scene.id] === "delete"}
                isEditing={isEditing}
                qaId="card_scene_favorite"
              />
            ))}
          </ScrollView>
        )}
      </View>
      <View style={globalStyles.darkDivider} />
    </>
  );
};
