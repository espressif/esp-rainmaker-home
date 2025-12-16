/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Check } from "lucide-react-native";
import { tokens } from "@/theme/tokens";
import { agentSelectionSheetStyles } from "@/theme/globalStyleSheet";
import type { Agent } from "@/utils/apiHelper";

interface AgentSelectionItemProps {
  agent: Agent;
  isSelected: boolean;
  onPress: () => void;
}

/**
 * AgentSelectionItem
 *
 * A component for displaying an agent item in the selection bottom sheet.
 * Features:
 * - Shows agent name and ID
 * - Highlights selected state
 * - Displays checkmark when selected
 */
export const AgentSelectionItem: React.FC<AgentSelectionItemProps> = ({
  agent,
  isSelected,
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={[
        agentSelectionSheetStyles.agentItem,
        isSelected && agentSelectionSheetStyles.agentItemSelected,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={agentSelectionSheetStyles.agentItemContent}>
        <View style={agentSelectionSheetStyles.agentInfo}>
          <Text
            style={[
              agentSelectionSheetStyles.agentName,
              isSelected && agentSelectionSheetStyles.agentNameSelected,
            ]}
          >
            {agent.name}
          </Text>
          <Text
            style={[
              agentSelectionSheetStyles.agentId,
              isSelected && agentSelectionSheetStyles.agentIdSelected,
            ]}
            numberOfLines={1}
          >
            {agent.agentId}
          </Text>
        </View>
        {isSelected && <Check size={20} color={tokens.colors.primary} />}
      </View>
    </TouchableOpacity>
  );
};




