/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";
import { useTranslation } from "react-i18next";

// Icons
import { Heart, Trash2 } from "lucide-react-native";

import { SceneItemProps } from "@/types/global";

interface SceneCardProps extends SceneItemProps {
  variant?: "horizontal" | "vertical";
  index?: number;
  isFavorite?: boolean;
  onFavoriteToggle?: () => void;
  saveFavoriteLoading?: boolean;
  sceneCardDimensions?: {
    width: number;
    height: number;
    cardsPerRow: number;
  };
  onDelete?: () => void;
  deleteLoading?: boolean;
  isEditing?: boolean;
}

/**
 * SceneItem
 *
 * A component for displaying a scene item in both horizontal (favorites) and vertical (all scenes) layouts.
 * Features include scene name, device count, favorite toggle, info button, and activate button.
 *
 * @param props - Component props including scene details and callbacks
 * @returns JSX component
 */
const SceneItem: React.FC<SceneCardProps> = ({
  index = 1,
  name,
  deviceCount,
  onPress,
  isFavorite = false,
  onFavoriteToggle,
  saveFavoriteLoading,
  onDelete,
  deleteLoading,
  sceneCardDimensions,
  isEditing = false,
}) => {
  const { t } = useTranslation();
  return (
    <Pressable
      style={[
        globalStyles.sceneCard,
        index % (sceneCardDimensions?.cardsPerRow ?? 1) != 0 &&
          globalStyles.sceneCardVertical,
        {
          width: sceneCardDimensions?.width || 120,
          height: sceneCardDimensions?.height || 120,
        },
      ]}
      onPress={onPress}
    >
      <View style={globalStyles.sceneCardHeader}>
        {isEditing ? (
          <TouchableOpacity
            style={globalStyles.sceneCardButton}
            onPress={onDelete}
          >
            {deleteLoading ? (
              <ActivityIndicator size="small" color={tokens.colors.bg3} />
            ) : (
              <Trash2 size={16} color={tokens.colors.red} />
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={globalStyles.sceneCardButton}
            onPress={onFavoriteToggle}
          >
            {saveFavoriteLoading ? (
              <ActivityIndicator size="small" color={tokens.colors.bg3} />
            ) : (
              <Heart
                size={16}
                color={tokens.colors.primary}
                fill={isFavorite ? tokens.colors.primary : "none"}
              />
            )}
          </TouchableOpacity>
        )}
      </View>
      <View style={globalStyles.sceneCardContent}>
        <Text
          style={[globalStyles.sceneCardName, { color: tokens.colors.black }]}
          numberOfLines={2}
        >
          {name}
        </Text>

        {/* Device Count Tag */}
        <View style={styles.deviceCountTag}>
          <Text style={styles.deviceCountText}>
            {deviceCount}{" "}
            {deviceCount > 1
              ? t("scene.scenes.multipleDeviceCountPostfix")
              : t("scene.scenes.singleDeviceCountPostfix")}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  deviceCountTag: {
    position: "absolute",
    bottom: -6,
    right: -5,
    backgroundColor: tokens.colors.bg4,
    borderRadius: 12,
    width: "75%",
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
    borderTopLeftRadius: 8,
    borderBottomRightRadius: tokens.radius.md,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 0,
    minWidth: 75,
  },
  deviceCountText: {
    color: tokens.colors.text_secondary,
    fontSize: 10,
    fontWeight: "400",
  },
});

export default SceneItem;
