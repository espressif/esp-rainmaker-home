/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Check, Trash2 } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { useTranslation } from "react-i18next";
import { canDeleteAgentBySource } from "@features/agent/utils/aggregation";
import { AgentCardProps } from "@src/types/global";

/**
 * Tappable row for one configured agent: shows name and ID, highlights when selected,
 * and shows a remove control in edit mode when deletion is allowed for the agent source.
 */
export const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  isSelected,
  isEditing,
  isLoading = false,
  onPress,
  onDelete,
}) => {
  const { t } = useTranslation();
  const showSelectedStyle = isSelected && !isEditing;
  const canDelete = canDeleteAgentBySource(agent);

  return (
    <TouchableOpacity
      style={[
        globalStyles.agentCard,
        showSelectedStyle && globalStyles.agentCardSelected,
        showSelectedStyle && globalStyles.agentCardSelectedBackground,
        globalStyles.shadowElevationForLightTheme,
      ]}
      onPress={onPress}
      disabled={isLoading || isEditing}
      activeOpacity={isEditing ? 1 : 0.7}
    >
      <View style={globalStyles.agentCardHeader}>
        <View style={globalStyles.agentCardInfo}>
          <Text
            style={[
              globalStyles.agentCardName,
              showSelectedStyle && globalStyles.agentCardNameSelected,
            ]}
            numberOfLines={1}
          >
            {agent.name}
          </Text>
          <Text
            style={[
              globalStyles.agentCardId,
              showSelectedStyle && globalStyles.agentCardIdSelected,
            ]}
            numberOfLines={1}
          >
            {agent.agentId}
          </Text>
        </View>
        {isEditing ? (
          canDelete ? (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={onDelete}
              disabled={isLoading}
              accessibilityRole="button"
              accessibilityLabel={t("layout.shared.remove")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={tokens.colors.red} />
              ) : (
                <Trash2 size={18} color={tokens.colors.red} />
              )}
            </TouchableOpacity>
          ) : null
        ) : (
          <View style={globalStyles.agentCardActions}>
            {isLoading ? (
              <ActivityIndicator
                size="small"
                color={isSelected ? tokens.colors.white : tokens.colors.primary}
              />
            ) : (
              isSelected && (
                <View style={globalStyles.agentCardSelectedBadge}>
                  <Check size={16} color={tokens.colors.white} />
                  <Text style={globalStyles.agentCardSelectedText}>
                    {t("aiSettings.selected")}
                  </Text>
                </View>
              )
            )}
          </View>
        )}
      </View>
      {agent.isDefault && (
        <View style={globalStyles.agentCardDefaultTagContainer}>
          <Text style={globalStyles.agentCardDefaultTag}>
            {t("aiSettings.default")}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.colors.bg2,
    alignItems: "center",
    justifyContent: "center",
  },
});
