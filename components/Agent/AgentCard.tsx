/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Check } from "lucide-react-native";
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";
import { useTranslation } from "react-i18next";
import type { AgentConfig } from "@/utils/agent";
import { canDeleteAgentBySource } from "@/utils/agent/aggregation";

interface AgentCardProps {
  agent: AgentConfig;
  isSelected: boolean;
  isEditing: boolean;
  isLoading?: boolean;
  onPress: () => void;
  onDelete?: () => void;
}

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
        styles.agentCard,
        isSelected && styles.agentCardSelected,
        isSelected && styles.agentCardSelectedBackground,
        globalStyles.shadowElevationForLightTheme,
      ]}
      onPress={onPress}
      disabled={isLoading}
    >
      <View style={styles.agentCardHeader}>
        <View style={styles.agentCardInfo}>
          <Text
            style={[
              styles.agentCardName,
              isSelected && styles.agentCardNameSelected,
            ]}
            numberOfLines={1}
          >
            {agent.name}
          </Text>
          <Text
            style={[
              styles.agentCardId,
              isSelected && styles.agentCardIdSelected,
            ]}
            numberOfLines={1}
          >
            {agent.agentId}
          </Text>
        </View>
        {isEditing ? (
          canDeleteAgentBySource(agent) && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={onDelete}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={tokens.colors.red} />
              ) : (
                <Text style={styles.deleteButtonText}>
                  {t("layout.shared.remove")}
                </Text>
              )}
            </TouchableOpacity>
          )
        ) : (
          <View style={styles.agentCardActions}>
            {isLoading ? (
              <ActivityIndicator
                size="small"
                color={isSelected ? tokens.colors.white : tokens.colors.primary}
              />
            ) : (
              isSelected && (
                <View style={styles.selectedBadge}>
                  <Check size={16} color={tokens.colors.white} />
                  <Text style={styles.selectedText}>
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
        <View style={styles.defaultTagContainer}>
          <Text style={styles.defaultTag}>{t("aiSettings.default")}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  agentCard: {
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing._15,
    borderWidth: 1,
    borderColor: tokens.colors.borderColor,
    position: "relative",
    marginBottom: tokens.spacing._10,
  },
  agentCardSelected: {
    borderColor: tokens.colors.primary,
    borderWidth: 2,
  },
  agentCardSelectedBackground: {
    backgroundColor: tokens.colors.primary,
  },
  agentCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  agentCardInfo: {
    flex: 1,
    marginRight: tokens.spacing._10,
  },
  agentCardName: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    marginBottom: tokens.spacing._5,
  },
  agentCardNameSelected: {
    color: tokens.colors.white,
  },
  agentCardId: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
  },
  agentCardIdSelected: {
    color: tokens.colors.white,
  },
  agentCardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._10,
  },
  selectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tokens.colors.primary,
    paddingHorizontal: tokens.spacing._10,
    paddingVertical: tokens.spacing._5,
    borderRadius: tokens.radius.sm,
    gap: tokens.spacing._5,
  },
  selectedText: {
    color: tokens.colors.white,
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.medium,
  },
  defaultTagContainer: {
    position: "absolute",
    bottom: 0,
    right: 0,
  },
  defaultTag: {
    color: tokens.colors.bg2,
    fontSize: tokens.fontSize.xxs,
    fontFamily: tokens.fonts.regular,
    paddingHorizontal: tokens.spacing._10,
    paddingVertical: tokens.spacing._5,
    borderRadius: tokens.radius.sm,
  },
  deleteButton: {
    paddingHorizontal: tokens.spacing._10,
    paddingVertical: tokens.spacing._5,
  },
  deleteButtonText: {
    color: tokens.colors.red,
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
  },
});

