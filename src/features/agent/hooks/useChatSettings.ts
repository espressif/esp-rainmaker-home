/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { saveChatFontSize } from "@features/agent/utils";
import { useToast } from "@shared/hooks/useToast";
import { useAgent } from "./useAgent";
import { useAgentChat } from "./useAgentChat";
import { AgentConfigResponse } from "@src/types/global";

type AgentConfigTool = NonNullable<AgentConfigResponse["tools"]>[number];

/**
 * useChatSettings hook
 * @returns Chat settings state and handler functions
 */
export function useChatSettings() {
  const { t } = useTranslation();
  const toast = useToast();
  const { fontSize, loadFontSize, setFontSize } = useAgentChat();
  const {
    agentConfig,
    isLoadingConfig,
    configError,
    loadAgentConfig,
    isLoadingConnectors,
    connectingToolUrl,
    disconnectingToolUrl,
    loadConnectors,
    getRemoteToolConnectionStatus,
    connectRemoteTool,
    disconnectTool,
    conversationId,
    loadConversationId,
  } = useAgent();

  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [disconnectToolUrl, setDisconnectToolUrl] = useState<string | null>(null);
  const [disconnectToolName, setDisconnectToolName] = useState<string>("");
  const [disconnectToolClientId, setDisconnectToolClientId] = useState<
    string | undefined
  >(undefined);
  const [disconnectToolAuthType, setDisconnectToolAuthType] = useState<
    string | undefined
  >(undefined);

  const isLoading = isLoadingConfig || isLoadingConnectors;
  const error = configError;
  const agentTools = agentConfig?.tools ?? [];

  useFocusEffect(
    useCallback(() => {
      loadAgentConfig();
      loadConnectors();
      loadConversationId();
      loadFontSize();
    }, [loadFontSize, loadAgentConfig, loadConnectors, loadConversationId])
  );

  const handleFontSizeChange = useCallback(
    async (value: number) => {
      const newSize = Math.round(value);
      setFontSize(newSize);
      try {
        await saveChatFontSize(newSize);
        toast.showSuccess(
          t("chatSettings.fontSizeUpdated") || "Font size updated",
          t("chatSettings.fontSizeUpdatedMessage") ||
          "Font size has been updated successfully."
        );
      } catch {
        toast.showError(
          t("chatSettings.fontSizeUpdateFailed") || "Failed to update font size",
          t("chatSettings.fontSizeUpdateFailedMessage") ||
          "Failed to save font size. Please try again."
        );
      }
    },
    [setFontSize, toast, t]
  );

  const handleDisconnectTool = useCallback(
    (tool: AgentConfigTool) => {
      setDisconnectToolUrl(tool.url ?? null);
      setDisconnectToolName(tool.name || "Tool");
      setDisconnectToolClientId(tool.oauthMetadata?.clientId);
      setDisconnectToolAuthType(tool.authType);
      setShowDisconnectDialog(true);
    },
    []
  );

  const confirmDisconnectTool = useCallback(async () => {
    if (!disconnectToolUrl) return;

    try {
      setShowDisconnectDialog(false);
      await disconnectTool(
        disconnectToolUrl,
        disconnectToolClientId,
        disconnectToolAuthType
      );

      toast.showSuccess(
        t("chatSettings.disconnectSuccess") || "Disconnected successfully",
        t("chatSettings.disconnectSuccessMessage") ||
        "Tool disconnected successfully"
      );
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : t("chatSettings.disconnectFailed") ||
          "Failed to disconnect. Please try again.";
      toast.showError(
        t("chatSettings.disconnectFailed") || "Disconnect failed",
        errorMessage
      );
    } finally {
      setDisconnectToolUrl(null);
      setDisconnectToolName("");
      setDisconnectToolClientId(undefined);
      setDisconnectToolAuthType(undefined);
    }
  }, [
    disconnectToolUrl,
    disconnectToolClientId,
    disconnectToolAuthType,
    disconnectTool,
    toast,
    t,
  ]);

  const closeDisconnectDialog = useCallback(() => {
    setShowDisconnectDialog(false);
    setDisconnectToolUrl(null);
    setDisconnectToolName("");
    setDisconnectToolClientId(undefined);
    setDisconnectToolAuthType(undefined);
  }, []);

  const handleConnectTool = useCallback(
    async (tool: AgentConfigTool) => {
      try {
        await connectRemoteTool(tool);

        toast.showSuccess(
          t("chatSettings.connectSuccess") || "Connected successfully",
          t("chatSettings.connectSuccessMessage") ||
          "Tool connected successfully"
        );
      } catch (err: unknown) {
        console.error("Failed to connect tool:", err);
        const errorMessage =
          err instanceof Error
            ? err.message
            : t("chatSettings.connectFailed") ||
            "Failed to connect. Please try again.";
        toast.showError(
          t("chatSettings.connectFailed") || "Failed to connect",
          errorMessage
        );
      }
    },
    [connectRemoteTool, toast, t]
  );

  return {
    agentConfig,
    agentTools,
    isLoading,
    error,
    fontSize,
    conversationId,
    loadAgentConfig,
    showDisconnectDialog,
    disconnectToolUrl,
    disconnectToolName,
    disconnectingToolUrl,
    handleFontSizeChange,
    handleDisconnectTool,
    confirmDisconnectTool,
    closeDisconnectDialog,
    handleConnectTool,
    getRemoteToolConnectionStatus,
    connectingToolUrl,
  };
}
