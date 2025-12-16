/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react-native";
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";
import {
  Header,
  ScreenWrapper,
  CollapsibleCard,
  InfoRow,
  ConfirmationDialog,
  FontSizeSlider,
} from "@/components";
import {
  saveChatFontSize,
  type OAuthMetadata,
} from "@/utils/agent";
import { useToast } from "@/hooks/useToast";
import { useAgent } from "@/hooks/useAgent";
import { useAgentChat } from "@/hooks/useAgentChat";
import { AgentConfigResponse } from "@/types/global";

// MCP Connector URL - defined locally to avoid import resolution issues
const RAINMAKER_MCP_CONNECTOR_URL = "https://mcp.rainmaker.espressif.com/api/mcp";

const ChatSettings = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const { width } = useWindowDimensions();
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
    getToolConnectionStatus,
    connectTool,
    connectToolWithTokensDirect,
    disconnectTool,
    conversationId,
    loadConversationId,
  } = useAgent();
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [disconnectToolUrl, setDisconnectToolUrl] = useState<string | null>(
    null
  );
  const [disconnectToolName, setDisconnectToolName] = useState<string>("");
  const [disconnectToolClientId, setDisconnectToolClientId] = useState<string | undefined>(undefined);
  const [disconnectToolAuthType, setDisconnectToolAuthType] = useState<string | undefined>(undefined);
  
  // Combined loading state
  const isLoading = isLoadingConfig || isLoadingConnectors;
  const error = configError;

  useFocusEffect(
    React.useCallback(() => {
      loadAgentConfig();
      loadConnectors();
      loadConversationId();
      loadFontSize();
    }, [loadFontSize, loadAgentConfig, loadConnectors, loadConversationId])
  );

  const handleFontSizeChange = async (value: number) => {
    const newSize = Math.round(value);
    setFontSize(newSize);
    try {
      await saveChatFontSize(newSize);
      toast.showSuccess(
        t("chatSettings.fontSizeUpdated") || "Font size updated",
        t("chatSettings.fontSizeUpdatedMessage") ||
          "Font size has been updated successfully."
      );
    } catch (error) {
      toast.showError(
        t("chatSettings.fontSizeUpdateFailed") || "Failed to update font size",
        t("chatSettings.fontSizeUpdateFailedMessage") ||
          "Failed to save font size. Please try again."
      );
    }
  };


  const handleDisconnectTool = async (tool: AgentConfigResponse["tools"][0]) => {
    setDisconnectToolUrl(tool.url);
    setDisconnectToolName(tool.name || `Tool`);
    setDisconnectToolClientId(tool.oauthMetadata?.clientId);
    setDisconnectToolAuthType(tool.authType);
    setShowDisconnectDialog(true);
  };

  const confirmDisconnectTool = async () => {
    if (!disconnectToolUrl) return;

    try {
      setShowDisconnectDialog(false);
      
      // Pass clientId and authType to disconnectTool
      await disconnectTool(disconnectToolUrl, disconnectToolClientId, disconnectToolAuthType);

      toast.showSuccess(
        t("chatSettings.disconnectSuccess") || "Disconnected successfully",
        t("chatSettings.disconnectSuccessMessage") || "Tool disconnected successfully"
      );
    } catch (err: any) {
      const errorMessage =
        err.message ||
        t("chatSettings.disconnectFailed") ||
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
  };

  const handleConnectTool = async (tool: AgentConfigResponse["tools"][0]) => {
    try {
      // Special case: MCP connector can use tokens directly without OAuth
      if (tool.url === RAINMAKER_MCP_CONNECTOR_URL) {
        // Get OAuth metadata from tool's oauthMetadata
        const oauthMetadata = tool.oauthMetadata
          ? {
              tokenEndpoint: tool.oauthMetadata.tokenEndpoint,
              clientId: tool.oauthMetadata.clientId,
              resource: tool.oauthMetadata.resource,
            }
          : undefined;

        // Use direct token connection for MCP connector
        await connectToolWithTokensDirect(tool.url, oauthMetadata);

        toast.showSuccess(
          t("chatSettings.connectSuccess") || "Connected successfully",
          t("chatSettings.connectSuccessMessage") || "Tool connected successfully"
        );
        return;
      }

      // For other connectors, use OAuth flow
      // Use OAuth metadata from tool
      if (tool.authType !== "oauth" || !tool.oauthMetadata) {
        throw new Error("OAuth metadata not available for this connector");
      }

      // Use redirect URI from config
      const fallbackClientId = tool.oauthMetadata.clientId || "";

      // Initiate OAuth flow using hook
      await connectTool(
        tool.url,
        tool.oauthMetadata as OAuthMetadata,
        fallbackClientId
      );

      toast.showSuccess(
        t("chatSettings.connectSuccess") || "Connected successfully",
        t("chatSettings.connectSuccessMessage") || "Tool connected successfully"
      );
    } catch (err: any) {
      console.error("Failed to connect tool:", err);
      const errorMessage =
        err.message ||
        t("chatSettings.connectFailed") ||
        "Failed to connect. Please try again.";
      toast.showError(
        t("chatSettings.connectFailed") || "Failed to connect",
        errorMessage
      );
    }
  };

  const renderBasicInfo = () => {
    if (!agentConfig) return null;

    return (
      <TouchableWithoutFeedback>
        <Pressable
          style={({ pressed }) => [
            globalStyles.infoContainer,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <InfoRow
            label={t("chatSettings.agentId") || "Agent ID"}
            value={agentConfig.agentId}
            isCopyable={true}
            scrollable={true}
            rightAligned={true}
          />
          <InfoRow
            label={t("chatSettings.name") || "Name"}
            value={agentConfig.name}
            scrollable={true}
            rightAligned={true}
          />
          {agentConfig.createdByName && (
            <InfoRow
              label={t("chatSettings.createdBy") || "Created By"}
              value={agentConfig.createdByName}
              scrollable={true}
              rightAligned={true}
            />
          )}
          <InfoRow
            label={t("chatSettings.textModelId") || "Text Model ID"}
            value={agentConfig.textModelId}
            scrollable={true}
            rightAligned={true}
          />
          <InfoRow
            label={t("chatSettings.speechModelId") || "Speech Model ID"}
            value={agentConfig.speechModelId}
            scrollable={true}
            rightAligned={true}
          />
          <InfoRow
            label={t("chatSettings.conversationId") || "Conversation ID"}
            value={
              conversationId ||
              t("chatSettings.noConversation") ||
              "No conversation"
            }
            isCopyable={!!conversationId}
            scrollable={true}
            rightAligned={true}
          />
        </Pressable>
      </TouchableWithoutFeedback>
    );
  };

  const renderToolCard = (
    tool: AgentConfigResponse["tools"][0],
    index: number
  ) => {
    let cardWidth = 180;
    if (width <= 500) {
      cardWidth = (width - tokens.spacing._15 * 3) / 2;
    }

    // Check if tool is in tools array
    const isInTools = agentConfig?.tools?.some(
      (toolItem: AgentConfigResponse["tools"][0]) => toolItem.url === tool.url
    );

    // For MCP connector, get expected connectorId from tool's oauthMetadata
    let expectedConnectorId: string | undefined;
    if (tool.url === RAINMAKER_MCP_CONNECTOR_URL && tool.oauthMetadata?.clientId) {
      expectedConnectorId = `${RAINMAKER_MCP_CONNECTOR_URL}::${tool.oauthMetadata.clientId}`;
    }

    // Only show connection controls if tool is in tools array
    const connectionStatus = isInTools
      ? getToolConnectionStatus(tool.url, expectedConnectorId)
      : null;
    const isConnecting = connectingToolUrl === tool.url;

    return (
      <TouchableWithoutFeedback key={index}>
        <Pressable
          key={index}
          style={({ pressed }) => [
            globalStyles.chatSettingsToolCard,
            {
              width: cardWidth,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={globalStyles.chatSettingsToolName} numberOfLines={2}>
            {tool.name || `Tool ${index + 1}`}
          </Text>
          {isInTools && connectionStatus ? (
            connectionStatus.isConnected ? (
              <Pressable
                style={({ pressed }) => [
                  globalStyles.chatSettingsConnectedBadge,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={() => handleDisconnectTool(tool)}
                disabled={disconnectingToolUrl === tool.url}
              >
                {disconnectingToolUrl === tool.url ? (
                  <ActivityIndicator
                    size="small"
                    color={tokens.colors.primary}
                  />
                ) : (
                  <Text style={globalStyles.chatSettingsConnectedText}>
                    {t("chatSettings.connected") || "Connected"}
                  </Text>
                )}
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  globalStyles.chatSettingsConnectButton,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={() => handleConnectTool(tool)}
                disabled={isConnecting}
              >
                <Text style={globalStyles.chatSettingsConnectButtonText}>
                  {isConnecting
                    ? t("chatSettings.connecting") || "Connecting..."
                    : t("chatSettings.connect") || "Connect"}
                </Text>
              </Pressable>
            )
          ) : null}
        </Pressable>
      </TouchableWithoutFeedback>
    );
  };

  const renderTools = () => {
    if (!agentConfig?.tools || agentConfig.tools.length === 0) {
      return (
        <Text style={globalStyles.chatSettingsEmptyText}>
          {t("chatSettings.noTools") || "No tools configured"}
        </Text>
      );
    }

    return (
      <View style={globalStyles.chatSettingsCardsGrid}>
        {agentConfig.tools.map((tool: AgentConfigResponse["tools"][0], index: number) => renderToolCard(tool, index))}
      </View>
    );
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={globalStyles.chatSettingsCenterContainer}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
          <Text style={globalStyles.chatSettingsLoadingText}>
            Loading agent configuration...
          </Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={globalStyles.chatSettingsCenterContainer}>
          <AlertCircle size={48} color={tokens.colors.error} />
          <Text style={globalStyles.chatSettingsErrorText}>{error}</Text>
          <TouchableOpacity
            style={globalStyles.chatSettingsRetryButton}
            onPress={() => loadAgentConfig()}
            activeOpacity={0.7}
          >
            <Text style={globalStyles.chatSettingsRetryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!agentConfig) {
      return (
        <View style={globalStyles.chatSettingsCenterContainer}>
          <Text style={globalStyles.chatSettingsEmptyText}>
            No agent configuration available
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        style={globalStyles.chatSettingsScrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={globalStyles.chatSettingsScrollContent}
      >
        <CollapsibleCard
          title={t("chatSettings.agentInfo") || "Agent Information"}
          defaultExpanded={true}
          style={{
            ...globalStyles.shadowElevationForLightTheme,
            backgroundColor: tokens.colors.white,
          }}
        >
          {renderBasicInfo()}
        </CollapsibleCard>

        {/* Tools Section */}
        <View style={globalStyles.chatSettingsSectionContainer}>
          <Text style={globalStyles.chatSettingsSectionTitle}>
            {t("chatSettings.tools") || "Tools"}
          </Text>
          {renderTools()}
        </View>

        {/* Font Size Section */}
        <CollapsibleCard
          title={t("chatSettings.fontSize") || "Font Size"}
          defaultExpanded={false}
          style={{
            ...globalStyles.shadowElevationForLightTheme,
            backgroundColor: tokens.colors.white,
          }}
        >
          <View style={{ padding: tokens.spacing._10 }}>
            <FontSizeSlider
              value={fontSize}
              onValueChange={handleFontSizeChange}
              minimumValue={1}
              maximumValue={4}
              step={1}
            />
          </View>
        </CollapsibleCard>
      </ScrollView>
    );
  };

  return (
    <>
      <Header
        label={t("chatSettings.title") || "Chat Settings"}
        showBack={true}
      />

      <ScreenWrapper
        style={{
          ...globalStyles.container,
          backgroundColor: tokens.colors.bg5,
          padding: 0,
        }}
        excludeTop={true}
      >
        {renderContent()}
      </ScreenWrapper>

      {/* Disconnect Tool Confirmation Dialog */}
      <ConfirmationDialog
        open={showDisconnectDialog}
        title={t("chatSettings.disconnectTool") || "Disconnect Tool"}
        description={
          t("chatSettings.disconnectToolConfirm", { toolName: disconnectToolName }) ||
          `Are you sure you want to disconnect ${disconnectToolName}? This will remove stored authentication credentials.`
        }
        confirmText={t("chatSettings.disconnect") || "Disconnect"}
        cancelText={t("common.cancel") || "Cancel"}
        onConfirm={confirmDisconnectTool}
        onCancel={() => {
          setShowDisconnectDialog(false);
          setDisconnectToolUrl(null);
          setDisconnectToolName("");
          setDisconnectToolClientId(undefined);
          setDisconnectToolAuthType(undefined);
        }}
        confirmColor={tokens.colors.red}
        isLoading={disconnectingToolUrl === disconnectToolUrl}
      />
    </>
  );
};

export default ChatSettings;
