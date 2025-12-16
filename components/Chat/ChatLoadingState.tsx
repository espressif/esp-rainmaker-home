/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

interface ChatLoadingStateProps {
  isConnectingConnector?: boolean;
}

/**
 * Loading state component for chat initialization
 */
export const ChatLoadingState: React.FC<ChatLoadingStateProps> = ({
  isConnectingConnector = false,
}) => {
  const { t } = useTranslation();

  return (
    <View style={globalStyles.chatInitializingContainer}>
      <ActivityIndicator size="large" color={tokens.colors.primary} />
      <Text style={globalStyles.chatInitializingText}>
        {isConnectingConnector
          ? t("chat.connectingConnector") || "Connecting Rainmaker MCP..."
          : t("chat.initializing") || "Initializing chat..."}
      </Text>
    </View>
  );
};

