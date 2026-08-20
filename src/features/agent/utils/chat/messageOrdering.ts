/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AGENT_CHAT_MESSAGE_TYPE_ASSISTANT,
  AGENT_CHAT_MESSAGE_TYPE_THINKING,
  AGENT_CHAT_MESSAGE_TYPE_THINKING_INDICATOR,
  AGENT_CHAT_THINKING_INDICATOR_MESSAGE_ID,
} from "@shared/utils/constants";
import type { MessageDisplayConfig } from "@features/agent/utils";
import type { ChatMessage } from "@src/types/global";

/**
 * Finds the index of the last user message in the chat history.
 * @param messages - Current chat message list.
 * @returns Index of the last user message, or -1 when none exist.
 */
export function findLastUserMessageIndex(messages: ChatMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].isUser) {
      return index;
    }
  }
  return -1;
}

/**
 * Finds the first assistant message index in the current turn.
 * @param messages - Current chat message list.
 * @param lastUserIndex - Index of the last user message in the turn.
 * @returns Index of the first assistant message after the user, or -1.
 */
export function findFirstAssistantIndexInCurrentTurn(
  messages: ChatMessage[],
  lastUserIndex: number
): number {
  for (let index = lastUserIndex + 1; index < messages.length; index += 1) {
    if (messages[index].messageType === AGENT_CHAT_MESSAGE_TYPE_ASSISTANT) {
      return index;
    }
  }
  return -1;
}

/**
 * Resolves where a new thinking message should be inserted so it stays above
 * the assistant response for the current turn.
 * @param messages - Current chat message list.
 * @returns Insert index for the thinking message.
 */
export function getThinkingInsertIndex(messages: ChatMessage[]): number {
  const lastUserIndex = findLastUserMessageIndex(messages);
  const firstAssistantIndex = findFirstAssistantIndexInCurrentTurn(
    messages,
    lastUserIndex
  );

  if (firstAssistantIndex >= 0) {
    return firstAssistantIndex;
  }

  return messages.length;
}

/**
 * Resolves where a new assistant message should be inserted within the current turn.
 * The first assistant chunk is placed after thinking; later chunks append at the end.
 * @param messages - Current chat message list.
 * @returns Insert index for the assistant message.
 */
export function getNewAssistantInsertIndex(messages: ChatMessage[]): number {
  const lastUserIndex = findLastUserMessageIndex(messages);
  const turnMessages = messages.slice(lastUserIndex + 1);

  if (turnMessages.length === 0) {
    return messages.length;
  }

  const hasAssistantInTurn = turnMessages.some(
    (message) => message.messageType === AGENT_CHAT_MESSAGE_TYPE_ASSISTANT
  );
  if (hasAssistantInTurn) {
    return messages.length;
  }

  const thinkingOffset = turnMessages.findIndex(
    (message) => message.messageType === AGENT_CHAT_MESSAGE_TYPE_THINKING
  );
  if (thinkingOffset >= 0) {
    return lastUserIndex + 1 + thinkingOffset + 1;
  }

  return messages.length;
}

/**
 * Ensures the thinking message for the current turn appears before the first assistant message.
 * @param messages - Current chat message list.
 * @returns Reordered message list when a correction was needed.
 */
export function ensureThinkingBeforeAssistant(
  messages: ChatMessage[]
): ChatMessage[] {
  const lastUserIndex = findLastUserMessageIndex(messages);

  let thinkingIndex = -1;
  let firstAssistantIndex = -1;

  for (let index = lastUserIndex + 1; index < messages.length; index += 1) {
    if (
      thinkingIndex === -1 &&
      messages[index].messageType === AGENT_CHAT_MESSAGE_TYPE_THINKING
    ) {
      thinkingIndex = index;
    }
    if (
      firstAssistantIndex === -1 &&
      messages[index].messageType === AGENT_CHAT_MESSAGE_TYPE_ASSISTANT
    ) {
      firstAssistantIndex = index;
    }
    if (thinkingIndex !== -1 && firstAssistantIndex !== -1) {
      break;
    }
  }

  if (
    thinkingIndex === -1 ||
    firstAssistantIndex === -1 ||
    thinkingIndex < firstAssistantIndex
  ) {
    return messages;
  }

  const reordered = [...messages];
  const [thinkingMessage] = reordered.splice(thinkingIndex, 1);
  const assistantIndexAfterRemoval = reordered.findIndex(
    (message, index) =>
      index > lastUserIndex &&
      message.messageType === AGENT_CHAT_MESSAGE_TYPE_ASSISTANT
  );

  if (assistantIndexAfterRemoval === -1) {
    reordered.push(thinkingMessage);
    return reordered;
  }

  reordered.splice(assistantIndexAfterRemoval, 0, thinkingMessage);
  return reordered;
}

/**
 * Returns whether tool call/result rows are shown in the chat transcript.
 * @param config - Message display configuration.
 * @returns True when either tool message type is visible.
 */
export function areAgentToolMessagesVisible(
  config: MessageDisplayConfig
): boolean {
  return config.showToolCallInfo || config.showToolResultInfo;
}

/**
 * Decides whether the live thinking shimmer should appear in the message list.
 * Shown while waiting only when tool messages are hidden; tool cards provide feedback otherwise.
 * @param showThinkingIndicator - Hook state for an in-flight agent transaction.
 * @param config - Message display configuration.
 * @returns True when the thinking indicator row should be rendered.
 */
export function shouldShowChatThinkingIndicator(
  showThinkingIndicator: boolean,
  config: MessageDisplayConfig
): boolean {
  if (!showThinkingIndicator || areAgentToolMessagesVisible(config)) {
    return false;
  }

  return true;
}

/**
 * Builds the FlatList data array with the live thinking indicator appended at the
 * end so it stays below any in-turn assistant or tool content.
 * @param messages - Persisted chat message history.
 * @param showThinkingIndicator - Whether the in-flight thinking shimmer is visible.
 * @returns Display messages including the optional indicator row.
 */
export function buildChatDisplayMessages(
  messages: ChatMessage[],
  showThinkingIndicator: boolean
): ChatMessage[] {
  if (!showThinkingIndicator) {
    return messages;
  }

  const indicatorMessage: ChatMessage = {
    id: AGENT_CHAT_THINKING_INDICATOR_MESSAGE_ID,
    text: "",
    isUser: false,
    timestamp: new Date(),
    messageType: AGENT_CHAT_MESSAGE_TYPE_THINKING_INDICATOR,
  };

  return [...messages, indicatorMessage];
}

/**
 * Inserts a message at the requested index while enforcing memory limits.
 * @param messages - Current chat message list.
 * @param message - Message to insert.
 * @param insertIndex - Target insertion index.
 * @param maxMessages - Maximum number of messages to retain.
 * @returns Updated message list with the inserted message.
 */
export function insertChatMessageAtIndex(
  messages: ChatMessage[],
  message: ChatMessage,
  insertIndex: number,
  maxMessages: number
): ChatMessage[] {
  const updated = [...messages];
  updated.splice(insertIndex, 0, message);
  const ordered = ensureThinkingBeforeAssistant(updated);

  if (ordered.length > maxMessages) {
    return ordered.slice(-maxMessages);
  }

  return ordered;
}
