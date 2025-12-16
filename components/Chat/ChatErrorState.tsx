/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { MessageSquareWarning } from "lucide-react-native";
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";
import { Button } from "@/components";

interface ChatErrorStateProps {
  error: string;
  isAgentConfigNotFound: boolean;
  onRetry: () => void;
}

/**
 * Error state component for chat
 */
export const ChatErrorState: React.FC<ChatErrorStateProps> = ({
  error,
  isAgentConfigNotFound,
  onRetry,
}) => {
  const { t } = useTranslation();
  const router = useRouter();

  if (isAgentConfigNotFound) {
    return (
      <>
        <View style={globalStyles.sceneEmptyStateContainer}>
          <View style={globalStyles.sceneEmptyStateIconContainerTop}>
            <MessageSquareWarning
              size={50}
              color={tokens.colors.primary}
            />
          </View>
          <Text style={globalStyles.emptyStateTitle}>
            {t("chat.agentConfigNotFound")}
          </Text>
          <Text
            style={[
              globalStyles.emptyStateDescription,
              { padding: tokens.spacing._20 },
            ]}
          >
            {t("chat.agentConfigNotFoundDescription")}
          </Text>
        </View>
        <View
          style={[
            globalStyles.footerAddButtonContainer,
            { bottom: tokens.spacing._10 },
          ]}
        >
          <Button
            label={t("chat.updateAgent")}
            onPress={() => router.push("/(agent)/Settings")}
            style={globalStyles.footerAddButton}
          />
        </View>
      </>
    );
  }

  return (
    <View style={globalStyles.chatErrorContainer}>
      <Text style={globalStyles.chatErrorText}>{error}</Text>
      <TouchableOpacity
        style={globalStyles.chatRetryButton}
        onPress={onRetry}
        activeOpacity={0.7}
      >
        <Text style={globalStyles.chatRetryButtonText}>
          {t("chat.retry") || "Retry"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

