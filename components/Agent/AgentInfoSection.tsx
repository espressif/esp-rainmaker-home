/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View } from "react-native";
import { InfoRow } from "@/components";
import { globalStyles } from "@/theme/globalStyleSheet";
import { useTranslation } from "react-i18next";
import { AgentInfoSectionProps } from "@/types/global";

export const AgentInfoSection: React.FC<AgentInfoSectionProps> = ({
  agentId,
  name,
  createdByName,
  textModelId,
  speechModelId,
  conversationId,
}) => {
  const { t } = useTranslation();

  return (
    <View style={globalStyles.infoContainer}>
      <InfoRow
        label={t("chatSettings.agentId") || "Agent ID"}
        value={agentId}
        isCopyable={true}
      />
      <InfoRow
        label={t("chatSettings.name") || "Name"}
        value={name}
      />
      {createdByName && (
        <InfoRow
          label={t("chatSettings.createdBy") || "Created By"}
          value={createdByName}
        />
      )}
      <InfoRow
        label={t("chatSettings.textModelId") || "Text Model ID"}
        value={textModelId}
      />
      <InfoRow
        label={t("chatSettings.speechModelId") || "Speech Model ID"}
        value={speechModelId}
      />
      {conversationId !== undefined && (
        <InfoRow
          label={t("chatSettings.conversationId") || "Conversation ID"}
          value={conversationId || t("chatSettings.noConversation") || "No conversation"}
          isCopyable={!!conversationId}
        />
      )}
    </View>
  );
};

