/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { ScreenWrapper, Header } from "@shared/components";
import { useTranslation } from "react-i18next";
import { ChatMessage } from "@features/agent/components";
import { useAgentChat } from "@features/agent/hooks";
import { getConversationByAgent } from "@features/agent/utils/apiHelper";
import { mapConversationMessage } from "@features/agent/utils/chat/conversationContent";
import { resolveChatMediaDownloadUrls } from "@features/agent/utils/chat/mediaUpload";
import type {
  ChatMessage as ChatMessageType,
  ConversationMessage,
} from "@src/types/global";

/**
 * ViewConversationScreen component
 * @returns Conversation viewer screen UI
 */
export function ViewConversationScreen() {
  const { t } = useTranslation();
  const { agentId, conversationId, title } = useLocalSearchParams<{
    agentId?: string;
    conversationId?: string;
    title?: string;
  }>();

  const {
    fontSize,
    isConnected,
  } = useAgentChat();

  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConversation = useCallback(async () => {
    if (!agentId || !conversationId) {
      setError(
        t("chat.conversations.invalidParams") ||
          "Missing agent or conversation information.",
      );
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const conv = await getConversationByAgent(
        agentId as string,
        conversationId as string,
      );

      const mapped: ChatMessageType[] = (
        await Promise.all(
          conv.messages?.map(async (msg: ConversationMessage, index: number) => {
            const baseId = `${conv.conversationId}-${index}-${msg.timestamp || Date.now()}`;
            const mappedContent = mapConversationMessage(msg);
            const media = await resolveChatMediaDownloadUrls(
              agentId as string,
              conversationId as string,
              mappedContent.media
            );
            const list: ChatMessageType[] = [
              {
                id: `${baseId}-main`,
                text: mappedContent.text,
                isUser: msg.role === "user",
                timestamp: new Date(msg.timestamp || Date.now()),
                messageType: msg.role === "user" ? "user" : "assistant",
                media,
              },
            ];

            // Tool calls -> tool_call_info messages
            if (msg.toolCalls && msg.toolCalls.length > 0) {
              msg.toolCalls.forEach((tool, tIndex) => {
                list.push({
                  id: `${baseId}-toolcall-${tIndex}`,
                  text: tool.name,
                  isUser: false,
                  timestamp: new Date(msg.timestamp || Date.now()),
                  messageType: "tool_call_info",
                  toolName: tool.name,
                  jsonData: {
                    input: tool.input,
                    toolUseId: tool.toolUseId,
                  },
                } as ChatMessageType);
              });
            }

            // Tool results -> tool_result_info messages
            if (msg.toolResults && msg.toolResults.length > 0) {
              msg.toolResults.forEach((toolResult, rIndex) => {
                list.push({
                  id: `${baseId}-toolresult-${rIndex}`,
                  text: "",
                  isUser: false,
                  timestamp: new Date(msg.timestamp || Date.now()),
                  messageType: "tool_result_info",
                  jsonData: toolResult.result,
                } as ChatMessageType);
              });
            }

            return list;
          }) ?? []
        )
      ).flat();

      setMessages(mapped);
    } catch (err: any) {
      console.error("Failed to load conversation:", err);
      setError(
        err?.message ||
          t("chat.conversations.loadError") ||
          "Failed to load conversation.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [agentId, conversationId, t]);

  useEffect(() => {
    loadConversation();
  }, [loadConversation]);

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessageType }) => (
      <ChatMessage
        item={item}
        fontSize={fontSize}
        isConnected={isConnected}
        onQuestionPress={() => {}}
      />
    ),
    [
      fontSize,
      isConnected,
    ],
  );

  const headerTitle =
    title ||
    t("chat.conversations.viewTitle") ||
    t("chat.conversations.title") ||
    "Conversation";

  return (
    <GestureHandlerRootView style={globalStyles.chatGestureContainer}>
      <Header label={headerTitle} showBack={true} />
      <ScreenWrapper
        style={globalStyles.chatContainer}
        excludeTop={true}
        dismissKeyboard={false}
      >
        {isLoading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={tokens.colors.primary} />
            <Text style={styles.loadingText}>
              {t("chat.conversations.loading") || "Loading conversation..."}
            </Text>
          </View>
        ) : error ? (
          <View style={styles.centerContent}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.centerContent}>
            <Text style={styles.emptyText}>
              {t("chat.conversations.empty") ||
                "No messages in this conversation yet."}
            </Text>
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            style={globalStyles.chatMessagesList}
            contentContainerStyle={[
              globalStyles.chatMessagesContent,
              messages.length === 0 && globalStyles.chatMessagesContentEmpty,
            ]}
            showsVerticalScrollIndicator={true}
          />
        )}
      </ScreenWrapper>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: tokens.spacing._20,
  },
  loadingText: {
    marginTop: tokens.spacing._10,
    ...globalStyles.fontSm,
    ...globalStyles.textSecondary,
    textAlign: "center",
  },
  errorText: {
    ...globalStyles.fontMd,
    ...globalStyles.textPrimary,
    textAlign: "center",
  },
  emptyText: {
    ...globalStyles.fontSm,
    ...globalStyles.textSecondary,
    textAlign: "center",
  },
});
