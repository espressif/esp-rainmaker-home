/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AGENT_CHAT_MESSAGE_TYPE_ASSISTANT,
  AGENT_CHAT_MESSAGE_TYPE_THINKING,
  AGENT_CHAT_THINKING_PREFIX,
  AGENT_CHAT_TOOL_PREFIX_EXECUTING,
  AGENT_CHAT_TOOL_PREFIX_RESULT,
} from "@shared/utils/constants";

const THINKING_TAG_PATTERN = /<thinking>([\s\S]*?)<\/thinking>/i;
const THINKING_TAG_GLOBAL_PATTERN = /<thinking>[\s\S]*?<\/thinking>/gi;
const THINKING_PREFIX_PATTERN = /^Thinking:\s?/i;

export interface ParsedStoredMessage {
  text: string;
  messageType: typeof AGENT_CHAT_MESSAGE_TYPE_THINKING | typeof AGENT_CHAT_MESSAGE_TYPE_ASSISTANT;
}

/**
 * Strips the "Thinking:" prefix from streamed or stored thinking content.
 * @param content - Raw thinking message text.
 * @returns Body text without the thinking label prefix.
 */
export function stripThinkingPrefix(content: string): string {
  return content.replace(THINKING_PREFIX_PATTERN, "").trim();
}

/**
 * Parses persisted conversation content, extracting embedded thinking tags.
 * @param content - Stored assistant message text.
 * @returns Display text and message type for the chat UI.
 */
export function parseStoredMessageContent(content: string): ParsedStoredMessage {
  const thinkingMatch = content.match(THINKING_TAG_PATTERN);
  if (thinkingMatch) {
    const thinkingContent = thinkingMatch[1].trim();
    const remainingContent = content.replace(THINKING_TAG_GLOBAL_PATTERN, "").trim();

    if (remainingContent) {
      return { text: remainingContent, messageType: AGENT_CHAT_MESSAGE_TYPE_ASSISTANT };
    }

    return {
      text: `${AGENT_CHAT_THINKING_PREFIX} ${thinkingContent}`,
      messageType: AGENT_CHAT_MESSAGE_TYPE_THINKING,
    };
  }

  if (content.toLowerCase().startsWith(AGENT_CHAT_THINKING_PREFIX.toLowerCase())) {
    return { text: content, messageType: AGENT_CHAT_MESSAGE_TYPE_THINKING };
  }

  return { text: content, messageType: AGENT_CHAT_MESSAGE_TYPE_ASSISTANT };
}

/**
 * Builds a unified tool message label for the collapsible tool card UI.
 * @param prefix - Tool action prefix (executing or result).
 * @param toolName - Tool identifier.
 * @param payload - Optional JSON payload to display.
 * @returns Formatted tool message text.
 */
export function buildToolMessageText(
  prefix: string,
  toolName: string,
  payload?: unknown
): string {
  if (!toolName) {
    return prefix;
  }

  if (payload === undefined || payload === null) {
    return `${prefix}: ${toolName}`;
  }

  const serialized =
    typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return `${prefix}: ${toolName}: ${serialized}`;
}

/**
 * Formats structured websocket payloads for display in collapsible JSON cards.
 * @param data - Raw JSON payload from a chat message.
 * @returns Pretty-printed JSON or plain text fallback.
 */
export function formatJsonPayload(data: unknown): string {
  if (data === undefined || data === null) {
    return "";
  }

  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!trimmed) {
      return "";
    }

    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return data;
    }
  }

  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

/**
 * Returns the executing-tool prefix constant for tool call messages.
 * @returns Executing tool prefix string.
 */
export function getExecutingToolPrefix(): string {
  return AGENT_CHAT_TOOL_PREFIX_EXECUTING;
}

/**
 * Returns the tool-result prefix constant for tool result messages.
 * @returns Tool result prefix string.
 */
export function getToolResultPrefix(): string {
  return AGENT_CHAT_TOOL_PREFIX_RESULT;
}
