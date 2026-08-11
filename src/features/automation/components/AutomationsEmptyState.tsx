/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Zap } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";

export interface AutomationsEmptyStateProps {
  /** True while pull-to-refresh is in progress */
  refreshing: boolean;
  /** Pull-to-refresh handler */
  onRefresh: () => void;
  /** Title text (e.g. "No automations yet" or "Add devices first") */
  title: string;
  /** Description text */
  description: string;
  /** Test ID for the scroll view */
  testID?: string;
}

/**
 * Empty automations state with its own ScrollView + RefreshControl so pull
 * works when there are no items (same Rooms empty-state approach).
 * Initial-load skeleton is owned by the Automations screen reveal transition.
 * @param props - Refresh flags, copy, and refresh handler
 * @returns Scrollable empty-state UI for the automations screen
 */
export const AutomationsEmptyState: React.FC<AutomationsEmptyStateProps> = ({
  refreshing,
  onRefresh,
  title,
  description,
  testID = "scroll_automations_empty",
}) => {
  return (
    <ScrollView
      {...testProps(testID)}
      style={globalStyles.automationsScrollView}
      contentContainerStyle={globalStyles.automationsScrollContent}
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
      <Pressable
        {...testProps("view_empty_automations")}
        style={globalStyles.automationEmptyStateContainer}
      >
        <View style={globalStyles.automationEmptyStateIconContainerTop}>
          <Zap size={35} color={tokens.colors.primary} />
        </View>
        <Text
          {...testProps("text_title_empty")}
          style={globalStyles.emptyStateTitle}
        >
          {title}
        </Text>
        <Text
          {...testProps("text_description_empty")}
          style={globalStyles.emptyStateDescription}
        >
          {description}
        </Text>
      </Pressable>
    </ScrollView>
  );
};
