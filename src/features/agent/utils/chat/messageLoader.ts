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
import { parseTimestamp } from "../chatHelper";
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
      const loadedMessages: ChatMessage[] = conversation.messages.map(
        (msg, index) => ({
          id: `${conversationId}-${index}-${msg.timestamp || Date.now()}`,
          text: msg.content || "",
          isUser: msg.role === "user",
          timestamp: parseTimestamp(msg.timestamp),
          messageType: msg.role === "user" ? "user" : "assistant",
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

