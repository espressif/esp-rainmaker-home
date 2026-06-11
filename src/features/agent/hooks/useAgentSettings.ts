/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useToast } from "@shared/hooks/useToast";
import { useAgent } from "./useAgent";
import { useCDF } from "@shared/hooks/useCDF";
import { validateAgentInput } from "@features/agent/utils/settingHelper";
import {
  validateAgent,
  removeInvalidAgentFromCustomData,
  getAllAgents,
  canDeleteAgentBySource,
  checkAgentExistenceAndAction,
  sanitizeAgentID,
} from "@features/agent/utils/aggregation";
import {
  getSelectedAgentId,
  getAgentsAndSelectedId,
  deleteConversationId,
  AGENT_SOURCE,
  AGENT_ROUTE_PATH,
} from "@features/agent/utils";
import { getAgentTermsAccepted } from "@features/agent/utils/storage";
import type { AgentConfig } from "@src/types/global";

/**
 * useAgentSettings hook
 * @returns Agent settings state and handler functions
 */
export function useAgentSettings() {
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const { store } = useCDF();
  const { agentId, agentName } = useLocalSearchParams<{
    agentId?: string;
    agentName?: string;
  }>();
  const { addAgent, selectAgent, deleteAgent } = useAgent();

  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddDialogVisible, setIsAddDialogVisible] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<AgentConfig | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const processedAgentIdRef = useRef<string | null>(null);
  const [showTermsBottomSheet, setShowTermsBottomSheet] = useState(false);

  const isLoading = isLoadingAgents && actionLoading === null;
  const user = store?.userStore.user;

  const fetchAgents = useCallback(async () => {
    try {
      setIsLoadingAgents(true);

      if (!user) {
        throw new Error("User not available");
      }
      const aggregatedAgents = await getAllAgents(user);

      const agentConfigs: AgentConfig[] = aggregatedAgents.map((agent) => ({
        id: agent.agentId,
        name: agent.name,
        agentId: agent.agentId,
        isDefault: agent.isDefault || false,
        source: agent.source,
      }));

      setAgents(agentConfigs);

      const currentSelectedId = await getSelectedAgentId(user, agentConfigs);
      setSelectedAgentId(currentSelectedId);
    } catch (error) {
      console.error("Error fetching agents:", error);
      try {
        if (user) {
          const { agents: customAgents, selectedAgentId: currentSelectedId } =
            await getAgentsAndSelectedId(user);
          setAgents(customAgents);
          setSelectedAgentId(currentSelectedId);
        } else {
          setAgents([]);
          setSelectedAgentId("");
        }
      } catch {
        setAgents([]);
        setSelectedAgentId("");
      }
    } finally {
      setIsLoadingAgents(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        const termsAccepted = getAgentTermsAccepted(user);
        if (!termsAccepted) {
          setShowTermsBottomSheet(true);
          return;
        }
      }
      fetchAgents();
    }, [fetchAgents, user])
  );

  useEffect(() => {
    const processResult = sanitizeAgentID(
      agentId,
      processedAgentIdRef.current,
      isLoadingAgents,
      agents
    );

    processedAgentIdRef.current = processResult.nextProcessedId;

    if (!processResult.shouldProcess) {
      return;
    }

    const result = checkAgentExistenceAndAction(
      processResult.trimmedAgentId,
      agents,
      selectedAgentId
    );

    if (result.shouldActivate && result.agent) {
      handleSelectAgent(result.agent);
    } else if (result.shouldShowModal) {
      setIsAddDialogVisible(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, agents, isLoadingAgents, selectedAgentId]);

  const handleAddAgent = useCallback(() => {
    setIsAddDialogVisible(true);
  }, []);

  const handleScanAgent = useCallback(() => {
    router.push(AGENT_ROUTE_PATH.AGENT_SCAN as never);
  }, [router]);

  const handleAddAgentConfirm = useCallback(
    async (name: string, agentIdValue: string) => {
      if (!validateAgentInput(name, agentIdValue)) {
        toast.showError(
          t("aiSettings.errors.invalidInput"),
          t("aiSettings.errors.fillAllFields"),
        );
        return;
      }

      try {
        setActionLoading("add");
        const trimmedName = name.trim();
        const trimmedAgentId = agentIdValue.trim();

        const validation = await validateAgent(trimmedAgentId);

        if (!validation.isValid) {
          toast.showError(
            t("aiSettings.errors.agentInvalid") || "Agent Invalid",
            t("aiSettings.errors.agentNotFound") ||
              "Agent not found. Please check the agent ID.",
          );
          setActionLoading(null);
          return;
        }

        const result = await addAgent(trimmedName, trimmedAgentId);

        await fetchAgents();

        if (!result.isUpdate) {
          const updatedAgents = await getAllAgents(user);
          const newAgent = updatedAgents.find(
            (agent) => agent.agentId === trimmedAgentId,
          );

          if (newAgent) {
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
            t("aiSettings.agentUpdated") || "Agent updated successfully",
          );
        } else {
          toast.showSuccess(
            t("aiSettings.title"),
            t("aiSettings.agentAdded") || "Agent added successfully",
          );
        }
      } catch {
        toast.showError(t("aiSettings.errors.saveFailed"));
      } finally {
        setActionLoading(null);
      }
    },
    [addAgent, fetchAgents, selectAgent, toast, t, user],
  );

  const closeAddDialog = useCallback(() => {
    setIsAddDialogVisible(false);
  }, []);

  const handleSelectAgent = useCallback(
    async (agent: AgentConfig) => {
      try {
        setActionLoading(agent.id);

        const validation = await validateAgent(agent.agentId);

        if (!validation.isValid) {
          toast.showError(
            t("aiSettings.errors.agentInvalid") || "Agent Invalid",
            t("aiSettings.errors.agentNotFoundRemoved") ||
            "Agent not found. It has been removed from your list."
          );

          if (user) {
            await removeInvalidAgentFromCustomData(agent.agentId, user);
            await fetchAgents();
          }

          setActionLoading(null);
          return;
        }

        await selectAgent(agent);

        if (user) {
          await deleteConversationId(user);
        }

        setSelectedAgentId(agent.agentId);

        toast.showSuccess(
          t("aiSettings.agentSetForChat") || "Agent set for chat",
          `${agent.name} is now active for chat`
        );
      } catch {
        toast.showError(t("aiSettings.errors.saveFailed"));
      } finally {
        setActionLoading(null);
      }
    },
    [fetchAgents, selectAgent, toast, t, user]
  );

  const handleDeleteAgent = useCallback(
    (agent: AgentConfig) => {
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
    },
    [toast, t]
  );

  const confirmDeleteAgent = useCallback(async () => {
    if (!agentToDelete) return;

    try {
      setActionLoading(agentToDelete.id);
      await deleteAgent(agentToDelete);

      await fetchAgents();

      setDeleteDialogVisible(false);
      setAgentToDelete(null);
      toast.showSuccess(
        t("common.delete"),
        t("aiSettings.agentDeleted") || "Agent deleted successfully"
      );
    } catch {
      toast.showError(t("aiSettings.errors.saveFailed"));
    } finally {
      setActionLoading(null);
    }
  }, [agentToDelete, deleteAgent, fetchAgents, toast, t]);

  const handleCloseDeleteDialog = useCallback(() => {
    setDeleteDialogVisible(false);
    setAgentToDelete(null);
  }, []);

  const groupAgentsBySource = useCallback(() => {
    const templateAgents = agents.filter(
      (a) => a.source === AGENT_SOURCE.TEMPLATE,
    );
    const userAgents = agents.filter((a) => a.source === AGENT_SOURCE.USER);
    const customAgents = agents.filter(
      (a) =>
        a.source === AGENT_SOURCE.CUSTOM ||
        (!a.source && !a.isDefault),
    );

    const defaultAgent = customAgents.find((a) => a.isDefault);
    const customAgentsWithoutDefault = customAgents.filter((a) => !a.isDefault);

    return {
      defaultAgent: defaultAgent ? [defaultAgent] : [],
      userAgents,
      customAgents: customAgentsWithoutDefault,
      templateAgents,
    };
  }, [agents]);

  const toggleEditing = useCallback(() => {
    setIsEditing((prev) => !prev);
  }, []);

  const closeTermsBottomSheet = useCallback(() => {
    setShowTermsBottomSheet(false);
    router.back();
  }, [router]);

  const completeTermsBottomSheet = useCallback(() => {
    setShowTermsBottomSheet(false);
    fetchAgents();
  }, [fetchAgents]);

  return {
    agents,
    selectedAgentId,
    isLoading,
    isEditing,
    isAddDialogVisible,
    deleteDialogVisible,
    agentToDelete,
    actionLoading,
    showTermsBottomSheet,
    agentId,
    agentName,
    fetchAgents,
    handleAddAgent,
    handleScanAgent,
    handleAddAgentConfirm,
    closeAddDialog,
    handleSelectAgent,
    handleDeleteAgent,
    confirmDeleteAgent,
    handleCloseDeleteDialog,
    groupAgentsBySource,
    toggleEditing,
    closeTermsBottomSheet,
    completeTermsBottomSheet,
  };
}
