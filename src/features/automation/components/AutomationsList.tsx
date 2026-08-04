/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import type { ESPCDFAutomation } from "@store";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";
import AutomationCard from "./AutomationCard";

export interface AutomationsListProps {
  /** List of automations to render (non-empty) */
  automations: ESPCDFAutomation[];
  /** Called when an automation card is pressed */
  onAutomationPress: (automation: ESPCDFAutomation) => void;
  /** Called when toggle is changed */
  onToggle: (automation: ESPCDFAutomation, enabled: boolean) => void;
  /** Called when delete is pressed in edit mode */
  onDelete: (automation: ESPCDFAutomation) => void;
  /** Map of automationId -> loading for toggle state */
  toggleLoadingStates: Record<string, boolean>;
  /** Map of automationId -> action loading ('delete', etc.) */
  actionLoadingStates: Record<string, string>;
  /** When true, cards show delete instead of toggle */
  isEditing: boolean;
  /** True while pull-to-refresh is in progress */
  refreshing: boolean;
  /** Pull-to-refresh handler */
  onRefresh: () => void;
  /** Test ID for the list container */
  testID?: string;
}

/**
 * FlatList of automation cards with pull-to-refresh (used when the list has items).
 * Empty state is handled separately by AutomationsEmptyState (Rooms pattern).
 * @param props - Automations, handlers, edit/refresh state
 * @returns FlatList filling the automations screen area
 */
export const AutomationsList: React.FC<AutomationsListProps> = ({
  automations,
  onAutomationPress,
  onToggle,
  onDelete,
  toggleLoadingStates,
  actionLoadingStates,
  isEditing,
  refreshing,
  onRefresh,
  testID = "scroll_automations",
}) => {
  /**
   * Renders one automation card row.
   * @param info - FlatList item payload
   * @returns Automation card element
   */
  const renderItem = useCallback(
    ({ item: automation }: { item: ESPCDFAutomation }) => {
      const automationId = automation.id;
      return (
        <AutomationCard
          automation={automation}
          onPress={() => onAutomationPress(automation)}
          onToggle={(enabled) => onToggle(automation, enabled)}
          onDelete={() => onDelete(automation)}
          toggleLoading={toggleLoadingStates[automationId] ?? false}
          deleteLoading={actionLoadingStates[automationId] === "delete"}
          isEditing={isEditing}
          qaId="card_automation"
        />
      );
    },
    [
      onAutomationPress,
      onToggle,
      onDelete,
      toggleLoadingStates,
      actionLoadingStates,
      isEditing,
    ],
  );

  /**
   * Stable key for each automation row.
   * @param item - Automation entity
   * @returns Unique list key
   */
  const keyExtractor = useCallback(
    (item: ESPCDFAutomation) => item.id,
    [],
  );

  return (
    <View {...testProps("view_automations_list")} style={globalStyles.flex1}>
      <FlatList
        {...testProps(testID)}
        data={automations}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        style={globalStyles.automationsScrollView}
        contentContainerStyle={[globalStyles.automationsScrollContent]}
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
      />
    </View>
  );
};
