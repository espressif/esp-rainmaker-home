/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Settings } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";

export interface SceneCreateEmptyStateProps {
  /** Empty-state title when no actions are selected. */
  title: string;
  /** Supporting description under the title. */
  description: string;
}

/**
 * Screen-level empty state for create scene when no device actions are selected.
 */
export const SceneCreateEmptyState: React.FC<SceneCreateEmptyStateProps> = ({
  title,
  description,
}) => {
  return (
    <View
      {...testProps("view_empty_actions_scenes")}
      style={styles.emptyState}
    >
      <View style={styles.emptyStateIconContainer}>
        <Settings size={35} color={tokens.colors.primary} />
      </View>
      <Text
        {...testProps("text_title_empty_scenes")}
        style={globalStyles.emptyStateTitle}
      >
        {title}
      </Text>
      <Text
        {...testProps("text_description_empty_scenes")}
        style={globalStyles.emptyStateDescription}
      >
        {description}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyStateIconContainer: {
    backgroundColor: tokens.colors.white,
    borderRadius: 48,
    padding: 20,
    marginBottom: 24,
  },
});
