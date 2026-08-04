/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { TouchableOpacity, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { Header } from "@shared/components";
import { testProps } from "@shared/utils/testProps";
import { styles } from "./ScenesHeader.styles";

interface ScenesHeaderProps {
  hasScenes: boolean;
  isEditing: boolean;
  onEditToggle: () => void;
}

/**
 * Header for the scenes screen.
 * Shows edit/done when scenes exist. Refresh is via pull-to-refresh only.
 * @param props - Scenes presence, edit mode, and edit toggle
 */
export const ScenesHeader = ({
  hasScenes,
  isEditing,
  onEditToggle,
}: ScenesHeaderProps) => {
  const { t } = useTranslation();

  return (
    <Header
      label={t("scene.scenes.title")}
      showBack={false}
      rightSlot={
        hasScenes ? (
          <TouchableOpacity
            {...testProps("button_edit_scenes")}
            onPress={onEditToggle}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text {...testProps("text_edit_scenes")} style={styles.editButton}>
              {isEditing ? t("scene.scenes.done") : t("scene.scenes.edit")}
            </Text>
          </TouchableOpacity>
        ) : null
      }
    />
  );
};
