/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text } from "react-native";
import { Settings } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";
import { createAutomationStyles as styles } from "../../theme/createAutomationStyles";

export interface CreateAutomationEmptyStateProps {
  /** Empty-state title (e.g. events or actions missing). */
  title: string;
  /** Supporting description under the title. */
  description: string;
  /** Test ID for the container view. */
  containerTestId: string;
  /** Test ID for the title text. */
  titleTestId: string;
  /** Test ID for the description text. */
  descriptionTestId: string;
}

/**
 * Screen-level empty state for create automation when events or actions are missing.
 */
export const CreateAutomationEmptyState: React.FC<
  CreateAutomationEmptyStateProps
> = ({
  title,
  description,
  containerTestId,
  titleTestId,
  descriptionTestId,
}) => {
  return (
    <View {...testProps(containerTestId)} style={styles.emptyStateContainer}>
      <View style={styles.emptyStateIconContainer}>
        <Settings size={35} color={tokens.colors.primary} />
      </View>
      <Text {...testProps(titleTestId)} style={globalStyles.emptyStateTitle}>
        {title}
      </Text>
      <Text
        {...testProps(descriptionTestId)}
        style={globalStyles.emptyStateDescription}
      >
        {description}
      </Text>
    </View>
  );
};
