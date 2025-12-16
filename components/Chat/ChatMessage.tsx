/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, Dimensions } from "react-native";
import { marked } from "marked";
import RenderHTML from "react-native-render-html";
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";
import { getFontSizes } from "@/utils/chat/fontSizes";
import { formatTimestamp } from "@/utils/chatHelper";
import { ChatJsonViewer } from "./ChatJsonViewer";
import { ChatQuestionSuggestions } from "./ChatQuestionSuggestions";
import type { ChatMessage as ChatMessageType } from "@/types/global";

interface ChatMessageProps {
  item: ChatMessageType;
  fontSize: number;
  expandedJsonMessages: Set<string>;
  isDefaultAgent: boolean;
  isConnected: boolean;
  onToggleJson: (messageId: string) => void;
  onQuestionPress: (question: string) => void;
}

/**
 * Chat message component that handles all message types
 */
export const ChatMessage: React.FC<ChatMessageProps> = ({
  item,
  fontSize,
  expandedJsonMessages,
  isDefaultAgent,
  isConnected,
  onToggleJson,
  onQuestionPress,
}) => {
  const fontSizes = getFontSizes(fontSize);
  const isAssistant = item.messageType === "assistant" && !item.isUser;
  const isThinking = item.messageType === "thinking";
  const isToolCall = item.messageType === "tool_call_info";
  const isToolResult = item.messageType === "tool_result_info";
  const isUsageInfo = item.messageType === "usage_info";
  const isHandshake = item.messageType === "handshake";
  const isHandshakeAck = item.messageType === "handshake_ack";
  const isTimeout = item.messageType === "timeout";
  const hasJsonData = item.jsonData !== undefined && item.jsonData !== null;

  // Check if this is the welcome message
  const isWelcomeMessage =
    isAssistant &&
    !item.isUser &&
    item.text.toLowerCase().includes("how can i help you");

  // Get screen width for RenderHTML
  const screenWidth = useMemo(() => Dimensions.get("window").width, []);

  // Convert markdown to HTML for assistant messages
  const htmlContent = useMemo(() => {
    if (isAssistant) {
      // marked.parse() returns a string synchronously
      return marked.parse(item.text, { breaks: true }) as string;
    }
    return null;
  }, [item.text, isAssistant]);

  // HTML styles for RenderHTML
  const htmlStyles = useMemo(() => {
    const textColor = item.isUser ? tokens.colors.bg1 : tokens.colors.text_primary;
    const codeBg = item.isUser ? "rgba(255,255,255,0.2)" : tokens.colors.bg3;
    const linkColor = item.isUser ? tokens.colors.bg1 : tokens.colors.primary;
    
    return {
      body: {
        color: textColor,
        fontSize: fontSizes.base,
        lineHeight: fontSizes.lineHeight,
        fontFamily: tokens.fonts.regular,
      },
      p: {
        marginTop: 0,
        marginBottom: 8,
        color: textColor,
        fontSize: fontSizes.base,
        lineHeight: fontSizes.lineHeight,
      },
      h1: {
        fontSize: fontSizes.heading1,
        fontWeight: "700" as const,
        marginBottom: 8,
        color: textColor,
      },
      h2: {
        fontSize: fontSizes.heading2,
        fontWeight: "700" as const,
        marginBottom: 6,
        color: textColor,
      },
      h3: {
        fontSize: fontSizes.heading3,
        fontWeight: "700" as const,
        marginBottom: 4,
        color: textColor,
      },
      code: {
        backgroundColor: codeBg,
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
        fontFamily: "monospace",
        fontSize: fontSizes.base * 0.9,
      },
      pre: {
        backgroundColor: codeBg,
        padding: 12,
        borderRadius: 8,
        marginVertical: 8,
        fontFamily: "monospace",
      },
      a: {
        color: linkColor,
        textDecorationLine: "underline" as const,
      },
      li: {
        marginBottom: 4,
        color: textColor,
      },
      ul: {
        marginBottom: 8,
      },
      ol: {
        marginBottom: 8,
      },
    };
  }, [item.isUser, fontSizes]);


  // Thinking messages - no background, subtle text
  if (isThinking) {
    return (
      <View style={globalStyles.chatThinkingWrapper}>
        <Text
          style={[
            globalStyles.chatThinkingText,
            {
              fontWeight: "bold",
              marginRight: 4,
              fontSize: fontSizes.base,
            },
          ]}
        >
          Thinking:
        </Text>
        <View style={globalStyles.chatThinkingContainer}>
          <Text
            style={[
              globalStyles.chatThinkingText,
              { fontSize: fontSizes.base },
            ]}
          >
            {item.text}
          </Text>
        </View>
      </View>
    );
  }

  // Tool call info - single line with tool name
  if (isToolCall) {
    return (
      <View style={globalStyles.chatToolCallWrapper}>
        <Text
          style={[
            globalStyles.chatToolCallText,
            { fontSize: fontSizes.base },
          ]}
        >
          Tool: {item.toolName || item.text}
        </Text>
      </View>
    );
  }

  // Tool result info - expandable JSON
  if (isToolResult && hasJsonData) {
    // Extract JSON part between the first '{' and last '}'
    let jsonContentPart: any = item.jsonData;
    if (typeof item.text === "string") {
      const str = item.text;
      const start = str.indexOf("{");
      const end = str.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        const jsonStr = str.substring(start, end + 1);
        try {
          jsonContentPart = JSON.parse(jsonStr);
        } catch {
          jsonContentPart = item.jsonData; // fallback
        }
      }
    }

    return (
      <View style={globalStyles.chatToolResultWrapper}>
        <ChatJsonViewer
          data={jsonContentPart}
          messageId={item.id}
          fontSize={fontSize}
          isExpanded={expandedJsonMessages.has(item.id)}
          onToggle={onToggleJson}
        />
      </View>
    );
  }

  // Usage info, handshake, and handshake_ack - expandable JSON, no background
  if ((isUsageInfo || isHandshake || isHandshakeAck) && hasJsonData) {
    let label = "";
    if (isUsageInfo) {
      label = "Usage:";
    } else if (isHandshake) {
      label = "Handshake:";
    } else if (isHandshakeAck) {
      label = "Handshake ACK:";
    }
    return (
      <View style={globalStyles.chatJsonMessageWrapper}>
        {label && (
          <Text
            style={[
              globalStyles.chatToolCallText,
              { fontSize: fontSizes.base },
            ]}
          >
            {label}
          </Text>
        )}
        <ChatJsonViewer
          data={item.jsonData}
          messageId={item.id}
          fontSize={fontSize}
          isExpanded={expandedJsonMessages.has(item.id)}
          onToggle={onToggleJson}
        />
      </View>
    );
  }

  // Timeout messages - error style
  if (isTimeout) {
    return (
      <View style={globalStyles.chatMessageWrapper}>
        <View
          style={[
            globalStyles.chatMessageContainer,
            globalStyles.chatTimeoutMessage,
          ]}
        >
          <Text
            style={[
              globalStyles.chatTimeoutMessageText,
              { fontSize: fontSizes.base },
            ]}
          >
            {item.text}
          </Text>
          <Text
            style={[
              globalStyles.chatTimestamp,
              globalStyles.chatBotTimestamp,
              { fontSize: fontSizes.timestamp },
            ]}
          >
            {formatTimestamp(item.timestamp)}
          </Text>
        </View>
      </View>
    );
  }

  // User and Assistant messages - with background
  return (
    <View>
      <TouchableOpacity
        activeOpacity={0.8}
        style={[
          globalStyles.chatMessageWrapper,
          item.isUser
            ? globalStyles.chatUserMessageWrapper
            : globalStyles.chatBotMessageWrapper,
        ]}
        onPress={() => {
          // Optional: you can trigger something (e.g. copy, select, info)
        }}
      >
        <View
          style={[
            globalStyles.chatMessageContainer,
            item.isUser
              ? globalStyles.chatUserMessage
              : globalStyles.chatBotMessage,
          ]}
        >
          {isAssistant && htmlContent ? (
            <View style={{ flexShrink: 1 }}>
              <RenderHTML
                contentWidth={screenWidth - 80}
                source={{ html: htmlContent }}
                tagsStyles={htmlStyles}
                baseStyle={{
                  color: item.isUser
                    ? tokens.colors.bg1
                    : tokens.colors.text_primary,
                  fontSize: fontSizes.base,
                  lineHeight: fontSizes.lineHeight,
                  fontFamily: tokens.fonts.regular,
                }}
              />
            </View>
          ) : (
            <Text
              style={[
                globalStyles.chatMessageText,
                item.isUser
                  ? globalStyles.chatUserMessageText
                  : globalStyles.chatBotMessageText,
                {
                  fontSize: fontSizes.base,
                  lineHeight: fontSizes.lineHeight,
                  flexShrink: 1,
                },
              ]}
            >
              {item.text}
            </Text>
          )}
          <View
            style={{
              flexDirection: "row",
              justifyContent: item.isUser ? "flex-end" : "flex-start",
              marginTop: 6,
            }}
          >
            <Text
              style={[
                globalStyles.chatTimestamp,
                item.isUser
                  ? globalStyles.chatUserTimestamp
                  : globalStyles.chatBotTimestamp,
                {
                  fontSize: fontSizes.timestamp,
                  color: item.isUser
                    ? tokens.colors.white
                    : tokens.colors.text_secondary,
                  marginTop: 0,
                },
              ]}
            >
              {formatTimestamp(item.timestamp)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
      {/* Render suggestions after welcome message */}
      {isWelcomeMessage && isDefaultAgent && isConnected && (
        <ChatQuestionSuggestions
          onQuestionPress={onQuestionPress}
        />
      )}
    </View>
  );
};

