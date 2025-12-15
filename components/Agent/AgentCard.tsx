/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Check } from "lucide-react-native";
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";
import { useTranslation } from "react-i18next";
import { canDeleteAgentBySource } from "@/utils/agent/aggregation";
import { AgentCardProps } from "@/types/global";

export const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  isSelected,
  isEditing,
  isLoading = false,
  onPress,
  onDelete,
}) => {
  const { t } = useTranslation();

  return (
    <TouchableOpacity
      style={[
        globalStyles.agentCard,
        isSelected && globalStyles.agentCardSelected,
        isSelected && globalStyles.agentCardSelectedBackground,
        globalStyles.shadowElevationForLightTheme,
      ]}
      onPress={onPress}
      disabled={isLoading}
    >
      <View style={globalStyles.agentCardHeader}>
        <View style={globalStyles.agentCardInfo}>
          <Text
            style={[
              globalStyles.agentCardName,
              isSelected && globalStyles.agentCardNameSelected,
            ]}
            numberOfLines={1}
          >
            {agent.name}
          </Text>
          <Text
            style={[
              globalStyles.agentCardId,
              isSelected && globalStyles.agentCardIdSelected,
            ]}
            numberOfLines={1}
          >
            {agent.agentId}
          </Text>
        </View>
        {isEditing ? (
          canDeleteAgentBySource(agent) && (
            <TouchableOpacity
              style={globalStyles.agentCardDeleteButton}
              onPress={onDelete}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={tokens.colors.red} />
              ) : (
                <Text style={globalStyles.agentCardDeleteButtonText}>
                  {t("layout.shared.remove")}
                </Text>
              )}
            </TouchableOpacity>
          )
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
      {/* Default tag at bottom right - always show for default agents */}
      {agent.isDefault && (
        <View style={globalStyles.agentCardDefaultTagContainer}>
          <Text style={globalStyles.agentCardDefaultTag}>{t("aiSettings.default")}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};
