/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import type { LucideIcon } from "lucide-react-native";

import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";

/** One tappable tile in the device settings quick-actions row. */
export interface SettingsQuickActionItem {
  id: string;
  label: string;
  Icon: LucideIcon;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  qaId: string;
}

interface SettingsQuickActionsProps {
  /** Ordered list of quick actions to render left-to-right */
  actions: SettingsQuickActionItem[];
}

/**
 * Horizontally scrollable quick-action tiles shown below node information.
 * Each tile is a bordered card with a centered 20×20 icon and title.
 * @param props - Quick action definitions from {@link useSettings}
 * @returns Scroll row, or null when there are no actions
 */
const SettingsQuickActions: React.FC<SettingsQuickActionsProps> = ({
  actions,
}) => {
  if (actions.length === 0) {
    return null;
  }

  return (
    <View style={globalStyles.settingsQuickActionsWrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={globalStyles.settingsQuickActionsScrollContent}
      >
        {actions.map((action) => {
          const { Icon, label, onPress, disabled, loading, qaId } = action;
          const isDisabled = Boolean(disabled || loading);

          return (
            <Pressable
              key={action.id}
              onPress={onPress}
              disabled={isDisabled}
              style={({ pressed }) => [
                globalStyles.settingsQuickActionTile,
                isDisabled && globalStyles.settingsQuickActionTileDisabled,
                pressed &&
                  !isDisabled &&
                  globalStyles.settingsQuickActionTilePressed,
              ]}
              {...testProps(qaId)}
            >
              <View style={globalStyles.settingsQuickActionIconSlot}>
                {loading ? (
                  <ActivityIndicator
                    size="small"
                    color={tokens.colors.primary}
                  />
                ) : (
                  <Icon size={tokens.iconSize._20} color={tokens.colors.primary} />
                )}
              </View>
              <Text
                style={globalStyles.settingsQuickActionTileLabel}
                numberOfLines={2}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

export default SettingsQuickActions;
