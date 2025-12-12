/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { CDF } from "@espressif/rainmaker-base-cdf";
import {
  getConversationId,
  getSelectedAgentId,
} from "@/utils/agent";
import { getConversationByAgent } from "@/utils/apiHelper";
import { parseTimestamp } from "@/utils/chatHelper";
import type { ChatMessage } from "@/types/global";

/**
 * Load previous conversation messages from API
 * @param userStore - CDF user store
 * @param setMessageHistory - Function to set message history
 * @param flatListRef - FlatList ref for scrolling
 */
export const loadPreviousMessages = async (
  userStore: CDF["userStore"],
  setMessageHistory: (messages: ChatMessage[]) => void,
  flatListRef: React.RefObject<any>
): Promise<void> => {
  try {
    if (!userStore) {
      addDefaultWelcomeMessage(setMessageHistory, flatListRef);
      return;
    }

    const conversationId = await getConversationId(userStore);
    if (!conversationId) {
      addDefaultWelcomeMessage(setMessageHistory, flatListRef);
      return;
    }

    const agentId = await getSelectedAgentId(userStore);
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
  } catch (error) {
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
    text: "How can I help you today?",
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

