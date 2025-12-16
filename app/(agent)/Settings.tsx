/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState, useEffect } from "react";
import {
  RefreshControl,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
} from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import {
  globalStyles,
  agentSelectionSheetStyles,
} from "@/theme/globalStyleSheet";

// Hooks
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/useToast";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";

// Icons
import { MessageSquare, RefreshCw } from "lucide-react-native";

// Components
import {
  Header,
  ScreenWrapper,
  Button,
  ConfirmationDialog,
  AddAgentBottomSheet,
} from "@/components";
import { AgentCard } from "@/components/Agent";

// Hooks
import { useAgent } from "@/hooks/useAgent";

// Types
import type { AgentConfig } from "@/types/global";

// Utils
import { validateAgentInput } from "@/utils/settingHelper";
import {
  validateAgent,
  removeInvalidAgentFromCustomData,
  getAllAgents,
  canDeleteAgentBySource,
} from "@/utils/agent/aggregation";
import { useCDF } from "@/hooks/useCDF";
import { getSelectedAgentId, getAgentsAndSelectedId, deleteConversationId, AGENT_SOURCE } from "@/utils/agent";

/**
 * Settings Component
 *
 * A screen component that displays and manages AI agents.
 * Allows users to view, add, select, and delete agents.
 *
 * Features:
 * - Lists all available agents
 * - Create new agents
 * - Select active agent
 * - Delete agents
 * - Pull to refresh
 */
const Settings = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const { store } = useCDF();
  const { agentId, agentName } = useLocalSearchParams<{
    agentId?: string;
    agentName?: string;
  }>();
  const { addAgent, selectAgent, deleteAgent } = useAgent();

  // State
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddDialogVisible, setIsAddDialogVisible] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<AgentConfig | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Combined loading state - show loader only when fetching agents (not during actions)
  // Don't show loader during actions to avoid double loaders
  const isLoading = isLoadingAgents && actionLoading === null;

  /**
   * Fetch aggregated agents from all sources
   */
  const fetchAgents = useCallback(async () => {
    try {
      setIsLoadingAgents(true);

      if (!store?.userStore) {
        throw new Error("Store not available");
      }

      // Get aggregated agents from all sources
      const aggregatedAgents = await getAllAgents(store.userStore);

      // Convert AggregatedAgent to AgentConfig format for display
      // Order is already: Default → Custom → User → Template (from getAllAgents)
      const agentConfigs: AgentConfig[] = aggregatedAgents.map(
        (agent) => ({
          id:agent.agentId,
          name: agent.name,
          agentId: agent.agentId,
          isDefault: agent.isDefault || false,
          source: agent.source,
        })
      );

      setAgents(agentConfigs);

      // Get selected agent ID from storage
      const currentSelectedId = await getSelectedAgentId(
        store.userStore,
        agentConfigs
      );
      setSelectedAgentId(currentSelectedId);
    } catch (error) {
      console.error("Error fetching agents:", error);
      // On error, try to get at least custom data agents
      try {
        if (store?.userStore) {
          const { agents: customAgents, selectedAgentId: currentSelectedId } =
            await getAgentsAndSelectedId(store.userStore);
          setAgents(customAgents);
          setSelectedAgentId(currentSelectedId);
        } else {
          setAgents([]);
          setSelectedAgentId("");
        }
      } catch (e) {
        setAgents([]);
        setSelectedAgentId("");
      }
    } finally {
      setIsLoadingAgents(false);
    }
  }, [store]);

  /**
   * Effect: Updates agents when screen comes into focus
   */
  useFocusEffect(
    useCallback(() => {
      fetchAgents();
    }, [fetchAgents])
  );

  /**
   * Effect: Auto-open modal when agentId is provided from route params
   */
  useEffect(() => {
    if (agentId) {
      setIsAddDialogVisible(true);
    }
  }, [agentId]);

  /**
   * Handles showing the add agent dialog
   */
  const handleAddAgent = () => {
    setIsAddDialogVisible(true);
  };

  /**
   * Handles agent creation confirmation
   * @param name - Agent name
   * @param agentId - Agent ID
   */
  const handleAddAgentConfirm = async (name: string, agentIdValue: string) => {
    if (!validateAgentInput(name, agentIdValue)) {
      toast.showError(
        t("aiSettings.errors.invalidInput"),
        t("aiSettings.errors.fillAllFields")
      );
      return;
    }

    try {
      setActionLoading("add");
      const trimmedName = name.trim();
      const trimmedAgentId = agentIdValue.trim();

      // Validate agent before adding
      const validation = await validateAgent(trimmedAgentId);

      if (!validation.isValid) {
        // Agent is invalid - show error
        toast.showError(
          t("aiSettings.errors.agentInvalid") || "Agent Invalid",
          t("aiSettings.errors.agentNotFound") ||
            "Agent not found. Please check the agent ID."
        );
        setActionLoading(null);
        return;
      }

      const result = await addAgent(trimmedName, trimmedAgentId);

      // Refresh agents list to get the updated list (includes aggregated agents)
      await fetchAgents();

      // Automatically activate the newly added agent
      if (!result.isUpdate) {
        // Find the agent by agentId from the updated agents list
        const updatedAgents = await getAllAgents(store?.userStore);
        const newAgent = updatedAgents.find(
          (agent) => agent.agentId === trimmedAgentId
        );

        if (newAgent) {
          // Convert to AgentConfig format
          const agentToActivate: AgentConfig = {
            id: `custom_${newAgent.agentId}`,
            name: newAgent.name,
            agentId: newAgent.agentId,
            isDefault: newAgent.isDefault || false,
            source: newAgent.source,
          };

          await selectAgent(agentToActivate);
          setSelectedAgentId(newAgent.agentId);
        }
      }

      setIsAddDialogVisible(false);

      if (result.isUpdate) {
        toast.showSuccess(
          t("aiSettings.title"),
          t("aiSettings.agentUpdated") || "Agent updated successfully"
        );
      } else {
        toast.showSuccess(
          t("aiSettings.title"),
          t("aiSettings.agentAdded") || "Agent added successfully"
        );
      }
    } catch (error) {
      toast.showError(t("aiSettings.errors.saveFailed"));
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Handles agent selection
   * Makes the selected agent active and notifies user
   * @param agent - Agent configuration to select
   */
  const handleSelectAgent = async (agent: AgentConfig) => {
    try {
      setActionLoading(agent.id);

      // Validate agent before selecting
      const validation = await validateAgent(agent.agentId);

      if (!validation.isValid) {
        // Agent is invalid - show error and remove from custom data if applicable
        toast.showError(
          t("aiSettings.errors.agentInvalid") || "Agent Invalid",
          t("aiSettings.errors.agentNotFoundRemoved") ||
            "Agent not found. It has been removed from your list."
        );

        // Remove from custom data if it exists there
        if (store?.userStore) {
          await removeInvalidAgentFromCustomData(
            agent.agentId,
            store.userStore
          );
          // Refresh agents list to reflect removal
          await fetchAgents();
        }

        setActionLoading(null);
        return;
      }

      await selectAgent(agent);

      // Clear conversation ID when selecting an agent (new agent = new conversation)
      // This ensures that selecting any agent starts a fresh conversation
      if (store?.userStore) {
        await deleteConversationId(store.userStore);
      }

      // Update selected agent ID in local state
      setSelectedAgentId(agent.agentId);

      toast.showSuccess(
        t("aiSettings.agentSetForChat") || "Agent set for chat",
        `${agent.name} is now active for chat`
      );
    } catch (error) {
      toast.showError(t("aiSettings.errors.saveFailed"));
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Handles agent deletion
   * Shows error if agent is default or not from custom data, otherwise shows confirmation dialog
   * @param agent - Agent configuration to delete
   */
  const handleDeleteAgent = (agent: AgentConfig) => {
    // Check if agent can be deleted based on source (user, template/common agents cannot be deleted)
    if (!canDeleteAgentBySource(agent)) {
      toast.showError(
        t("aiSettings.errors.cannotDelete"),
        t("aiSettings.errors.cannotDeleteTemplateOrUser") ||
          "Cannot delete template or user agents. Only custom agents can be deleted."
      );
      return;
    }

    setAgentToDelete(agent);
    setDeleteDialogVisible(true);
  };

  /**
   * Confirms agent deletion
   */
  const confirmDeleteAgent = async () => {
    if (!agentToDelete) return;

    try {
      setActionLoading(agentToDelete.id);
      await deleteAgent(agentToDelete);

      // Refresh agents list to reflect deletion
      await fetchAgents();

      setDeleteDialogVisible(false);
      setAgentToDelete(null);
      toast.showSuccess(
        t("common.delete"),
        t("aiSettings.agentDeleted") || "Agent deleted successfully"
      );
    } catch (error) {
      toast.showError(t("aiSettings.errors.saveFailed"));
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Handles closing delete dialog
   */
  const handleCloseDeleteDialog = () => {
    setDeleteDialogVisible(false);
    setAgentToDelete(null);
  };

  /**
   * Groups agents by source for display
   */
  const groupAgentsBySource = () => {
    const templateAgents = agents.filter((a) => a.source === AGENT_SOURCE.TEMPLATE);
    const userAgents = agents.filter((a) => a.source === AGENT_SOURCE.USER);
    const customAgents = agents.filter((a) => a.source === AGENT_SOURCE.CUSTOM);

    // Separate default agent from custom agents
    const defaultAgent = customAgents.find((a) => a.isDefault);
    const customAgentsWithoutDefault = customAgents.filter((a) => !a.isDefault);

    return {
      defaultAgent: defaultAgent ? [defaultAgent] : [],
      userAgents,
      customAgents: customAgentsWithoutDefault,
      templateAgents,
    };
  };

  /**
   * Renders a section with agents
   */
  const renderSection = (title: string, sectionAgents: AgentConfig[]) => {
    if (sectionAgents.length === 0) return null;

    return (
      <View
        style={[
          agentSelectionSheetStyles.section,
          { paddingHorizontal: 0, marginBottom: 0 },
        ]}
      >
        <Text style={agentSelectionSheetStyles.sectionTitle}>{title}</Text>
        {sectionAgents.map((agent) => {
          const isAgentLoading = actionLoading === agent.id;
          return (
            <AgentCard
              key={agent.id}
              agent={agent}
              isSelected={selectedAgentId === agent.agentId}
              isEditing={isEditing}
              isLoading={isAgentLoading}
              onPress={() =>
                !isEditing && !isAgentLoading && handleSelectAgent(agent)
              }
              onDelete={() => handleDeleteAgent(agent)}
            />
          );
        })}
      </View>
    );
  };

  /**
   * Renders empty state when no agents exist
   */
  const renderEmptyState = () => {
    if (isLoading) return;
    return (
      <View style={globalStyles.sceneEmptyStateContainer}>
        <>
          <View style={globalStyles.sceneEmptyStateIconContainerTop}>
            <MessageSquare size={35} color={tokens.colors.primary} />
          </View>
          <Text style={globalStyles.emptyStateTitle}>
            {t("aiSettings.noAgents")}
          </Text>
          <Text style={globalStyles.emptyStateDescription}>
            {t("aiSettings.noAgentsDescription")}
          </Text>
        </>
      </View>
    );
  };

  /**
   * Renders header right slot
   * Shows edit button when agents exist, refresh button otherwise
   */
  const renderHeaderRightSlot = () => {
    if (agents.length > 0) {
      return (
        <TouchableOpacity
          onPress={() => setIsEditing(!isEditing)}
          style={globalStyles.agentSettingsEditButtonContainer}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={globalStyles.agentSettingsEditButton}>
            {isEditing
              ? t("schedule.schedules.done") || "Done"
              : t("schedule.schedules.edit") || "Edit"}
          </Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        onPress={fetchAgents}
        style={globalStyles.agentSettingsEditButtonContainer}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <RefreshCw size={20} color={tokens.colors.primary} />
      </TouchableOpacity>
    );
  };

  return (
    <>
      <Header
        label={t("aiSettings.title")}
        showBack={true}
        rightSlot={renderHeaderRightSlot()}
      />
      <ScreenWrapper style={globalStyles.agentSettingsContainer}>
        <ScrollView
          style={globalStyles.agentSettingsScrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: 150,
          }}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={fetchAgents} />
          }
        >
          {agents.length > 0 ? (
            <View style={globalStyles.agentSettingsList}>
              {(() => {
                const grouped = groupAgentsBySource();
                return (
                  <>
                    {/* Default Agent */}
                    {renderSection(
                      t("device.panels.aiAgent.defaultAgent") ||
                        "Default Agent",
                      grouped.defaultAgent
                    )}
                    {/* User Agents */}
                    {renderSection(
                      t("device.panels.aiAgent.userAgents") || "User Agents",
                      grouped.userAgents
                    )}
                    {/* Custom Stored Agents */}
                    {renderSection(
                      t("device.panels.aiAgent.customAgents") ||
                        "Custom Agents",
                      grouped.customAgents
                    )}
                    {/* Common Agents */}
                    {renderSection(
                      t("device.panels.aiAgent.commonAgents") ||
                        "Common Agents",
                      grouped.templateAgents
                    )}
                  </>
                );
              })()}
            </View>
          ) : (
            renderEmptyState()
          )}
        </ScrollView>

        {/* Fixed Add Agent Button */}
        <View style={globalStyles.agentSettingsFooterButton}>
          <Button
            label={t("aiSettings.addNewAgent")}
            onPress={handleAddAgent}
            style={globalStyles.footerAddButton}
          />
        </View>
      </ScreenWrapper>

      {/* Add Agent Bottom Sheet */}
      <AddAgentBottomSheet
        visible={isAddDialogVisible}
        onClose={() => {
          setIsAddDialogVisible(false);
        }}
        onSave={handleAddAgentConfirm}
        initialAgentId={agentId}
        initialAgentName={agentName}
        existingAgents={agents}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteDialogVisible}
        title={t("aiSettings.confirmDelete.title")}
        description={t("aiSettings.confirmDelete.message")}
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        onConfirm={confirmDeleteAgent}
        onCancel={handleCloseDeleteDialog}
        confirmColor={tokens.colors.red}
        isLoading={actionLoading === agentToDelete?.id}
      />
    </>
  );
};

export default Settings;
