/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { TouchableOpacity, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react-native";
import { Header } from "@shared/components";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";
import { styles } from "./ScenesHeader.styles";

interface ScenesHeaderProps {
  hasScenes: boolean;
  isEditing: boolean;
  onEditToggle: () => void;
  onRefresh: () => void;
}

/**
 * Header component for scenes screen
 * Shows edit/done button when scenes exist, or refresh button when no scenes
 */
export const ScenesHeader = ({
  hasScenes,
  isEditing,
  onEditToggle,
  onRefresh,
}: ScenesHeaderProps) => {
  const { t } = useTranslation();

  return (
    <Header
      label={t("scene.scenes.title")}
      showBack={false}
      rightSlot={
        <View style={styles.rightSlot}>
          {hasScenes ? (
            <TouchableOpacity
              {...testProps("button_edit_scenes")}
              onPress={onEditToggle}
            >
              <Text {...testProps("text_edit_scenes")} style={styles.editButton}>
                {isEditing ? t("scene.scenes.done") : t("scene.scenes.edit")}
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            {...testProps("button_refresh_scenes")}
            onPress={onRefresh}
          >
            <RefreshCw size={20} color={tokens.colors.primary} />
          </TouchableOpacity>
        </View>
      }
    />
  );
};
