/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useWindowDimensions } from "react-native";
import { AlertCircle } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { CollapsibleCard } from "@shared/components";
import { isConnectableRemoteTool } from "@features/agent/utils";
import FontSizeSlider from "./FontSizeSlider";
import { ChatSettingsBasicInfo } from "./ChatSettingsBasicInfo";
import { ChatSettingsToolCard } from "./ChatSettingsToolCard";
import { ChatSettingsToolDetailBottomSheet } from "./ChatSettingsToolDetailBottomSheet";
import { AgentConfigResponse } from "@src/types/global";

type AgentConfigTool = NonNullable<AgentConfigResponse["tools"]>[number];

interface ChatSettingsContentProps {
  isLoading: boolean;
  error: string | null;
  agentConfig: AgentConfigResponse | null;
  agentTools: AgentConfigTool[];
  fontSize: number;
  conversationId: string | null;
  onRetry: () => void;
  onFontSizeChange: (value: number) => void;
  onConnectTool: (tool: AgentConfigTool) => void;
  onDisconnectTool: (tool: AgentConfigTool) => void;
  getRemoteToolConnectionStatus: (
    tool: AgentConfigTool,
  ) => { isConnected: boolean; isExpired: boolean };
  connectingToolUrl: string | null;
  disconnectingToolUrl: string | null;
}

/**
 * Full chat settings body: loading/error, basic agent info, tool grid with connector actions, and font size slider.
 */
export function ChatSettingsContent({
  isLoading,
  error,
  agentConfig,
  agentTools,
  fontSize,
  conversationId,
  onRetry,
  onFontSizeChange,
  onConnectTool,
  onDisconnectTool,
  getRemoteToolConnectionStatus,
  connectingToolUrl,
  disconnectingToolUrl,
}: ChatSettingsContentProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [selectedTool, setSelectedTool] = useState<AgentConfigTool | null>(null);
  const [showToolDetailSheet, setShowToolDetailSheet] = useState(false);

  const getCardWidth = () => {
    if (width <= 500) {
      return (width - tokens.spacing._15 * 3) / 2;
    }
    return 180;
  };

  const cardWidth = getCardWidth();

  /**
   * Opens the enabled-tools bottom sheet for the tapped tool card.
   */
  const handleToolCardPress = (tool: AgentConfigTool) => {
    setSelectedTool(tool);
    setShowToolDetailSheet(true);
  };

  /**
   * Closes the enabled-tools bottom sheet and clears the selection.
   */
  const handleCloseToolDetailSheet = () => {
    setShowToolDetailSheet(false);
    setSelectedTool(null);
  };

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
          onPress={onRetry}
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
    <>
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
        <ChatSettingsBasicInfo
          agentConfig={agentConfig}
          conversationId={conversationId}
        />
      </CollapsibleCard>

      <View style={globalStyles.chatSettingsSectionContainer}>
        <Text style={globalStyles.chatSettingsSectionTitle}>
          {t("chatSettings.tools") || "Tools"}
        </Text>
        {!agentTools || agentTools.length === 0 ? (
          <Text style={globalStyles.chatSettingsEmptyText}>
            {t("chatSettings.noTools") || "No tools configured"}
          </Text>
        ) : (
          <View style={globalStyles.chatSettingsCardsGrid}>
            {agentTools.map((tool: AgentConfigTool, index: number) => {
              const showConnectorActions = isConnectableRemoteTool(tool);
              const connectionStatus = showConnectorActions
                ? getRemoteToolConnectionStatus(tool)
                : null;

              return (
                <ChatSettingsToolCard
                  key={tool.name ?? tool.url ?? index}
                  tool={tool}
                  index={index}
                  cardWidth={cardWidth}
                  isInTools={showConnectorActions}
                  connectionStatus={connectionStatus}
                  isConnecting={connectingToolUrl === tool.url}
                  isDisconnecting={disconnectingToolUrl === tool.url}
                  onConnect={onConnectTool}
                  onDisconnect={onDisconnectTool}
                  onPress={handleToolCardPress}
                />
              );
            })}
          </View>
        )}
      </View>

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
            onValueChange={onFontSizeChange}
            minimumValue={1}
            maximumValue={4}
            step={1}
          />
        </View>
      </CollapsibleCard>
    </ScrollView>

    <ChatSettingsToolDetailBottomSheet
      visible={showToolDetailSheet}
      tool={selectedTool}
      onClose={handleCloseToolDetailSheet}
    />
    </>
  );
}
