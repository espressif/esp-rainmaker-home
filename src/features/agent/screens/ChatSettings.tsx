/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTranslation } from "react-i18next";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { Header, ScreenWrapper, ConfirmationDialog } from "@shared/components";
import { ChatSettingsContent } from "@features/agent/components";
import { useChatSettings } from "@features/agent/hooks";

/**
 * ChatSettingsScreen component
 * @returns Chat settings screen UI
 */
export function ChatSettingsScreen() {
  const { t } = useTranslation();
  const {
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
  } = useChatSettings();

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
        <ChatSettingsContent
          isLoading={isLoading}
          error={error}
          agentConfig={agentConfig}
          agentTools={agentTools}
          fontSize={fontSize}
          conversationId={conversationId}
          onRetry={loadAgentConfig}
          onFontSizeChange={handleFontSizeChange}
          onConnectTool={handleConnectTool}
          onDisconnectTool={handleDisconnectTool}
          getRemoteToolConnectionStatus={getRemoteToolConnectionStatus}
          connectingToolUrl={connectingToolUrl}
          disconnectingToolUrl={disconnectingToolUrl}
        />
      </ScreenWrapper>

      <ConfirmationDialog
        open={showDisconnectDialog}
        title={t("chatSettings.disconnectTool") || "Disconnect Tool"}
        description={t("chatSettings.disconnectToolConfirm", {
          toolName: disconnectToolName,
        })}
        confirmText={t("chatSettings.disconnect") || "Disconnect"}
        cancelText={t("common.cancel") || "Cancel"}
        onConfirm={confirmDisconnectTool}
        onCancel={closeDisconnectDialog}
        confirmColor={tokens.colors.red}
        isLoading={
          !!disconnectToolUrl && disconnectingToolUrl === disconnectToolUrl
        }
      />
    </>
  );
}
