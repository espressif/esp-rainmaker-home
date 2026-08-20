/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import i18n from "@/i18n";
import { ESPCDFUser } from "@store";
import {
  getConversationId,
  getSelectedAgentId,
} from "@features/agent/utils";
import { getConversationByAgent } from "../apiHelper";
import {
  mapConversationMessage,
} from "./conversationContent";
import { resolveChatMediaDownloadUrls } from "./mediaUpload";
import { parseStoredMessageContent } from "./messageContentParser";
import { parseTimestamp } from "../chatHelper";
import {
  AGENT_CHAT_MESSAGE_ROLE_ASSISTANT,
  AGENT_CHAT_MESSAGE_ROLE_USER,
} from "@shared/utils/constants";
import type { ChatMessage } from "@src/types/global";

/**
 * Load previous conversation messages from API
 * @param userStore - CDF user store
 * @param setMessageHistory - Function to set message history
 * @param flatListRef - FlatList ref for scrolling
 */
export const loadPreviousMessages = async (
  user: ESPCDFUser,
  setMessageHistory: (messages: ChatMessage[]) => void,
  flatListRef: React.RefObject<any>
): Promise<void> => {
  try {
    if (!user) {
      addDefaultWelcomeMessage(setMessageHistory, flatListRef);
      return;
    }

    const conversationId = await getConversationId(user);
    if (!conversationId) {
      addDefaultWelcomeMessage(setMessageHistory, flatListRef);
      return;
    }

    const agentId = await getSelectedAgentId(user);
    const conversation = await getConversationByAgent(
      agentId,
      conversationId
    );

    if (
      conversation &&
      conversation.messages &&
      conversation.messages.length > 0
    ) {
      // Load previous messages
      const loadedMessages: ChatMessage[] = await Promise.all(
        conversation.messages.map(async (msg, index) => {
          const mappedContent = mapConversationMessage(msg);
          const isUser = msg.role === AGENT_CHAT_MESSAGE_ROLE_USER;
          const parsedAssistant = !isUser
            ? parseStoredMessageContent(mappedContent.text)
            : null;
          const media = await resolveChatMediaDownloadUrls(
            agentId,
            conversationId,
            mappedContent.media
          );

          return {
            id: `${conversationId}-${index}-${msg.timestamp || Date.now()}`,
            text: isUser
              ? mappedContent.text
              : parsedAssistant?.text || mappedContent.text,
            isUser,
            timestamp: parseTimestamp(msg.timestamp),
            messageType: isUser
              ? AGENT_CHAT_MESSAGE_ROLE_USER
              : parsedAssistant?.messageType || AGENT_CHAT_MESSAGE_ROLE_ASSISTANT,
            media,
          };
        })
      );

      setMessageHistory(loadedMessages);

      // Scroll to bottom after loading messages
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: false });
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: false });
          }, 200);
        }
      }, 100);
    } else {
      addDefaultWelcomeMessage(setMessageHistory, flatListRef);
    }
  } catch {
    // If loading fails, add default message
    addDefaultWelcomeMessage(setMessageHistory, flatListRef);
  }
};

/**
 * Add default welcome message
 * @param setMessageHistory - Function to set message history
 * @param flatListRef - FlatList ref for scrolling
 */
export const addDefaultWelcomeMessage = (
  setMessageHistory: (messages: ChatMessage[]) => void,
  flatListRef: React.RefObject<any>
): void => {
  const welcomeMessage: ChatMessage = {
    id: `welcome-${Date.now()}`,
    text: i18n.t("chat.welcomeMessage"),
    isUser: false,
    timestamp: new Date(),
    messageType: "assistant",
  };

  setMessageHistory([welcomeMessage]);

  // Scroll to bottom
  setTimeout(() => {
    if (flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated: false });
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 200);
    }
  }, 100);
};

