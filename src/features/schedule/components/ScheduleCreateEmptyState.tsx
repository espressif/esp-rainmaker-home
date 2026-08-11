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

export interface ScheduleCreateEmptyStateProps {
  /** Empty-state title when no actions are selected. */
  title: string;
  /** Supporting description under the title. */
  description: string;
}

/**
 * Screen-level empty state for create schedule when no device actions are selected.
 */
export const ScheduleCreateEmptyState: React.FC<
  ScheduleCreateEmptyStateProps
> = ({ title, description }) => {
  return (
    <View
      {...testProps("view_empty_actions")}
      style={globalStyles.scheduleActionsEmptyStateContainer}
    >
      <View style={globalStyles.scheduleActionsEmptyStateIconContainer}>
        <Settings size={35} color={tokens.colors.primary} />
      </View>
      <Text
        {...testProps("text_title_empty_schedule")}
        style={globalStyles.emptyStateTitle}
      >
        {title}
      </Text>
      <Text
        {...testProps("text_description_empty_schedule")}
        style={globalStyles.emptyStateDescription}
      >
        {description}
      </Text>
    </View>
  );
};
