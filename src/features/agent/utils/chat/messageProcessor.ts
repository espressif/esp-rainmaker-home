/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { extractJsonData } from "../chatHelper";
import {
  buildToolMessageText,
  getExecutingToolPrefix,
  getToolResultPrefix,
} from "./messageContentParser";
import type { WebSocketMessage, MessageDisplayConfig } from "@features/agent/utils";
import {
  AGENT_WS_MESSAGE_TYPE_ASSISTANT,
  AGENT_WS_MESSAGE_TYPE_HANDSHAKE,
  AGENT_WS_MESSAGE_TYPE_HANDSHAKE_ACK,
  AGENT_WS_MESSAGE_TYPE_THINKING,
  AGENT_WS_MESSAGE_TYPE_TIMEOUT,
  AGENT_WS_MESSAGE_TYPE_TOOL_CALL_INFO,
  AGENT_WS_MESSAGE_TYPE_TOOL_RESULT_INFO,
  AGENT_WS_MESSAGE_TYPE_TRANSACTION_END,
  AGENT_WS_MESSAGE_TYPE_USAGE_INFO,
  AGENT_WS_MESSAGE_TYPE_USER,
} from "@shared/utils/constants";

export interface ProcessedMessage {
  action: "add" | "update_state" | "timeout" | "handshake_ack" | "skip";
  messageType: string;
  text?: string;
  isUser?: boolean;
  toolName?: string;
  jsonData?: any;
  conversationId?: string | null;
  shouldFlushThinking?: boolean;
  shouldSetThinking?: boolean;
  shouldSetConversationDone?: boolean;
  shouldEndStreamingBubble?: boolean;
}

/**
 * Process WebSocket message and determine what action to take
 * @param message - WebSocket message
 * @param messageDisplayConfig - Message display configuration
 * @param thinkingMessages - Current thinking messages array
 * @returns Processed message with action to take
 */
export const processWebSocketMessage = (
  message: WebSocketMessage,
  messageDisplayConfig: MessageDisplayConfig,
  thinkingMessages: string[]
): ProcessedMessage => {
  const { type, content, content_type } = message;

  // Handle timeout - special case that needs navigation
  if (type === AGENT_WS_MESSAGE_TYPE_TIMEOUT) {
    let timeoutMessage = "Chat Session timed out. Please reconnect.";

    // Extract message from content if available
    if (content_type === "json") {
      try {
        const timeoutData =
          typeof content === "string" ? JSON.parse(content) : content;
        if (
          timeoutData &&
          typeof timeoutData === "object" &&
          timeoutData.message
        ) {
          timeoutMessage = timeoutData.message;
        }
      } catch {
        // Silent error handling
      }
    } else if (typeof content === "string") {
      try {
        const timeoutData = JSON.parse(content);
        if (
          timeoutData &&
          typeof timeoutData === "object" &&
          timeoutData.message
        ) {
          timeoutMessage = timeoutData.message;
        }
      } catch {
        timeoutMessage = content;
      }
    }

    return {
      action: "timeout",
      messageType: "timeout",
      text: timeoutMessage,
      isUser: false,
    };
  }

  // Handle handshake_ack - extract conversationId and jsonData
  if (type === AGENT_WS_MESSAGE_TYPE_HANDSHAKE_ACK) {
    let conversationId: string | null = null;
    let jsonData: any = null;

    try {
      if (content_type === "json") {
        if (typeof content === "string") {
          const parsed = JSON.parse(content);
          conversationId = parsed?.conversationId || null;
          jsonData = parsed;
        } else if (typeof content === "object" && content !== null) {
          conversationId = (content as any)?.conversationId || null;
          jsonData = content;
        }
      } else {
        try {
          jsonData =
            typeof content === "string" ? JSON.parse(content) : content;
        } catch {
          jsonData = content;
        }
      }
    } catch (error) {
      console.error(
        "Failed to extract conversationId from handshake_ack:",
        error
      );
    }

    return {
      action: "handshake_ack",
      messageType: "handshake_ack",
      conversationId,
      jsonData,
    };
  }

  // Handle transaction_end - mark conversation as done
  if (type === AGENT_WS_MESSAGE_TYPE_TRANSACTION_END) {
    return {
      action: "update_state",
      messageType: "transaction_end",
      shouldFlushThinking: true,
      shouldSetConversationDone: true,
      shouldSetThinking: false,
      text:
        thinkingMessages.length > 0
          ? thinkingMessages.join(" ")
          : undefined,
    };
  }

  // Determine if message should be displayed
  let shouldDisplay = false;
  let isUserMessage = false;

  switch (type) {
    case AGENT_WS_MESSAGE_TYPE_USER:
      shouldDisplay = messageDisplayConfig.showUser;
      isUserMessage = true;
      break;
    case AGENT_WS_MESSAGE_TYPE_ASSISTANT:
      shouldDisplay = messageDisplayConfig.showAssistant;
      break;
    case AGENT_WS_MESSAGE_TYPE_THINKING:
      shouldDisplay = messageDisplayConfig.showThinking;
      break;
    case AGENT_WS_MESSAGE_TYPE_TOOL_CALL_INFO:
      shouldDisplay = messageDisplayConfig.showToolCallInfo;
      break;
    case AGENT_WS_MESSAGE_TYPE_TOOL_RESULT_INFO:
      shouldDisplay = messageDisplayConfig.showToolResultInfo;
      break;
    case AGENT_WS_MESSAGE_TYPE_USAGE_INFO:
      shouldDisplay = messageDisplayConfig.showUsageInfo;
      break;
    case AGENT_WS_MESSAGE_TYPE_HANDSHAKE:
      shouldDisplay = true;
      break;
    default:
      shouldDisplay = false;
  }

  // Handle thinking messages - append to array instead of displaying immediately
  if (type === AGENT_WS_MESSAGE_TYPE_THINKING) {
    const textContent =
      typeof content === "string" ? content : JSON.stringify(content);
    return {
      action: shouldDisplay ? "add" : "skip",
      messageType: "thinking",
      text: textContent,
      isUser: false,
      shouldSetThinking: true,
    };
  }

  if (!shouldDisplay) {
    return {
      action: "skip",
      messageType: type,
    };
  }

  // Handle tool_call_info - extract tool name
  if (type === AGENT_WS_MESSAGE_TYPE_TOOL_CALL_INFO) {
    let toolName = "";

    if (typeof content === "string") {
      // Try to parse as JSON first
      try {
        const parsed = JSON.parse(content);
        if (typeof parsed === "object" && parsed !== null) {
          // Extract tool name from keys like "get_node_details: {}"
          const keys = Object.keys(parsed);
          if (keys.length > 0) {
            toolName = keys[0];
          } else {
            toolName = content;
          }
        } else {
          toolName = content;
        }
      } catch {
        // If not JSON, check if it's in format "tool_name: {}"
        const match = content.match(/^([^:]+):\s*\{/);
        if (match) {
          toolName = match[1].trim();
        } else {
          toolName = content;
        }
      }
    } else if (typeof content === "object" && content !== null) {
      const keys = Object.keys(content);
      if (keys.length > 0) {
        toolName = keys[0];
      }
    }

    return {
      action: "add",
      messageType: AGENT_WS_MESSAGE_TYPE_TOOL_CALL_INFO,
      text: buildToolMessageText(getExecutingToolPrefix(), toolName, content),
      isUser: false,
      toolName,
      shouldEndStreamingBubble: true,
    };
  }

  // Handle tool_result_info - extract tool name and JSON data
  if (type === AGENT_WS_MESSAGE_TYPE_TOOL_RESULT_INFO) {
    let toolName = "";
    let jsonData: any = null;

    if (typeof content === "string") {
      // Extract tool name from format "tool_name: {...}"
      const match = content.match(/^([^:]+):/);
      if (match) {
        toolName = match[1].trim();
        // Use extractJsonData to parse Python-style JSON
        jsonData = extractJsonData(content);
        if (!jsonData) {
          // Fallback: try to extract JSON substring
          try {
            const startIdx = content.indexOf("{");
            const endIdx = content.lastIndexOf("}");
            if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
              const jsonSubstring = content.substring(startIdx, endIdx + 1);
              jsonData = JSON.parse(jsonSubstring);
            } else {
              jsonData = content.substring(match[0].length).trim();
            }
          } catch {
            jsonData = content.substring(match[0].length).trim();
          }
        }
      } else {
        // No tool name found, try to parse as JSON directly
        jsonData = extractJsonData(content);
        if (!jsonData) {
          jsonData = content;
        }
      }
    } else if (typeof content === "object" && content !== null) {
      const keys = Object.keys(content);
      if (keys.length > 0) {
        toolName = keys[0];
        jsonData = (content as Record<string, any>)[keys[0]];
      } else {
        jsonData = content;
      }
    }

    return {
      action: "add",
      messageType: AGENT_WS_MESSAGE_TYPE_TOOL_RESULT_INFO,
      text: buildToolMessageText(getToolResultPrefix(), toolName, jsonData),
      isUser: false,
      toolName,
      jsonData,
    };
  }

  // Handle usage_info and handshake - JSON expandable (handshake_ack handled above)
  if (type === AGENT_WS_MESSAGE_TYPE_USAGE_INFO || type === AGENT_WS_MESSAGE_TYPE_HANDSHAKE) {
    let jsonData: any = null;

    if (content_type === "json") {
      if (typeof content === "string") {
        try {
          jsonData = JSON.parse(content);
        } catch {
          jsonData = content;
        }
      } else {
        jsonData = content;
      }
    } else {
      try {
        jsonData =
          typeof content === "string" ? JSON.parse(content) : content;
      } catch {
        jsonData = content;
      }
    }

    return {
      action: "add",
      messageType: type,
      text: "",
      isUser: false,
      jsonData,
    };
  }

  // Handle regular messages (user, assistant)
  let textContent = "";
  if (content_type === "json") {
    if (typeof content === "string") {
      try {
        const parsed = JSON.parse(content);
        textContent = JSON.stringify(parsed, null, 2);
      } catch {
        textContent = content;
      }
    } else {
      textContent = JSON.stringify(content, null, 2);
    }
  } else {
    textContent =
      typeof content === "string" ? content : JSON.stringify(content);
  }

  if (
    textContent.toLowerCase().trim() === "done" ||
    textContent.toLowerCase().trim() === "**done**"
  ) {
    return {
      action: "skip",
      messageType: type,
    };
  }

  return {
    action: "add",
    messageType: type,
    text: textContent,
    isUser: isUserMessage,
    // Only set thinking to true for user messages
    // For assistant messages, don't change thinking state (keep it true if it was true)
    // This allows thinking indicator to stay visible during tool calls
    shouldSetThinking: type === AGENT_WS_MESSAGE_TYPE_USER ? true : undefined,
    shouldFlushThinking:
      type === AGENT_WS_MESSAGE_TYPE_ASSISTANT && thinkingMessages.length > 0,
  };
};

