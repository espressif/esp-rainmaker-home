/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from "react-native";

import { useTranslation } from "react-i18next";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles, agentSelectionSheetStyles } from "@/theme/globalStyleSheet";

// Icons
import { X } from "lucide-react-native";

// Components
import { AgentSelectionItem } from "@/components/Agent";
import { EmptyState, Button } from "@/components";

// Utils
import { getAllAgents } from "@/utils/agent/aggregation";
import { useCDF } from "@/hooks/useCDF";

// Types
import type { AgentSelectionBottomSheetProps, AggregatedAgent } from "@/types/global";
import { AGENT_SOURCE } from "@/utils/agent/constants";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

/**
 * AgentSelectionBottomSheet
 *
 * A bottom sheet component for selecting an agent.
 * Features:
 * - Slides up from bottom with animation
 * - Shows Your Agents and Public Agents in separate sections
 * - Highlights currently selected agent
 * - Auto-saves on selection
 */
const AgentSelectionBottomSheet: React.FC<AgentSelectionBottomSheetProps> = ({
  visible,
  onClose,
  onSelect,
  currentAgentId,
}) => {
  const { t } = useTranslation();
  const { store } = useCDF();
  const [allAgents, setAllAgents] = useState<AggregatedAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      loadAgents();
    } else {
      setError(null);
    }
  }, [visible]);

  const loadAgents = async () => {
    setLoading(true);
    setError(null);
    try {
      const agents = await getAllAgents(store?.userStore);
      setAllAgents(agents || []);
    } catch (err: any) {
      console.error("Failed to load agents:", err);
      setError(t("device.panels.aiAgent.agentSelectionError"));
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropPress = () => {
    onClose();
  };

  const handleContentPress = (e: any) => {
    e.stopPropagation();
  };

  const handleAgentSelect = (agent: AggregatedAgent) => {
    onSelect(agent.agentId);
    onClose();
  };

  const isAgentSelected = (agentId: string): boolean => {
    return currentAgentId?.trim() === agentId.trim();
  };

  // Group agents by source for display
  const templateAgents = allAgents.filter((a) => a.source === AGENT_SOURCE.TEMPLATE);
  const userAgents = allAgents.filter((a) => a.source === AGENT_SOURCE.USER);
  const customAgents = allAgents.filter((a) => a.source === AGENT_SOURCE.CUSTOM);
  
  // Separate default agent from custom agents
  const defaultAgent = customAgents.find((a) => a.isDefault);
  const customAgentsWithoutDefault = customAgents.filter((a) => !a.isDefault);

  const renderSection = (title: string, agents: AggregatedAgent[]) => {
    if (agents.length === 0) return null;

    return (
      <View style={agentSelectionSheetStyles.section}>
        <Text style={agentSelectionSheetStyles.sectionTitle}>{title}</Text>
        {agents.map((agent) => (
          <AgentSelectionItem
            key={agent.agentId}
            agent={{
              agentId: agent.agentId,
              name: agent.name,
              adminId: agent.adminId || '',
              toolConfiguration: agent.toolConfiguration,
              modelId: agent.modelId,
              createdByName: agent.createdByName,
            }}
            isSelected={isAgentSelected(agent.agentId)}
            onPress={() => handleAgentSelect(agent)}
          />
        ))}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={globalStyles.drawerOverlay} onPress={handleBackdropPress}>
        <Pressable
          style={[agentSelectionSheetStyles.content, styles.content]}
          onPress={handleContentPress}
        >
          {/* Handle */}
          <View style={globalStyles.drawerHandle} />

          {/* Header */}
          <View style={agentSelectionSheetStyles.header}>
            <Text style={agentSelectionSheetStyles.title}>
              {t("device.panels.aiAgent.selectAgent")}
            </Text>
            <TouchableOpacity
              style={agentSelectionSheetStyles.closeButton}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={20} color={tokens.colors.text_secondary} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={agentSelectionSheetStyles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={[globalStyles.loadingContainer, styles.loadingWrapper]}>
                <ActivityIndicator
                  size="large"
                  color={tokens.colors.primary}
                />
                <Text style={globalStyles.loadingText}>
                  {t("device.panels.aiAgent.loadingAgents")}
                </Text>
              </View>
            ) : error ? (
              <View style={[globalStyles.errorContainer, styles.errorWrapper]}>
                <Text style={globalStyles.errorText}>{error}</Text>
                <Button
                  label={t("common.retry")}
                  onPress={loadAgents}
                  isLoading={loading}
                  wrapperStyle={styles.retryButtonWrapper}
                />
              </View>
            ) : (
              <>
                {/* Default Agent */}
                {defaultAgent &&
                  renderSection(
                    t("device.panels.aiAgent.defaultAgent") || "Default Agent",
                    [defaultAgent]
                  )}
                {/* Your Agents */}
                {renderSection(
                  t("device.panels.aiAgent.userAgents") || "Your Agents",
                  userAgents
                )}
                {/* Custom Stored Agents */}
                {renderSection(
                  t("device.panels.aiAgent.customAgents") || "Custom Agents",
                  customAgentsWithoutDefault
                )}
                {/* Public Agents */}
                {renderSection(
                  t("device.panels.aiAgent.commonAgents") || "Public Agents",
                  templateAgents
                )}
                {allAgents.length === 0 && (
                  <EmptyState
                    message={t("device.panels.aiAgent.noAgentsAvailable")}
                  />
                )}
              </>
            )}
          </ScrollView>

          {/* Bottom safe area */}
          <View style={globalStyles.bottomSafeArea} />
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  content: {
    height: SCREEN_HEIGHT * 0.6,
    maxHeight: SCREEN_HEIGHT * 0.6,
    padding:0
  },
  scrollView: {
    flex: 1,
  },
  loadingWrapper: {
    minHeight: 200,
    padding: tokens.spacing._40,
  },
  errorWrapper: {
    minHeight: 200,
    padding: tokens.spacing._40,
  },
  retryButtonWrapper: {
    marginTop: tokens.spacing._20,
  },
});

export default AgentSelectionBottomSheet;
