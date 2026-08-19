/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Wrench, ChevronDown, ChevronRight } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { getFontSizes } from "@features/agent/utils/chat/fontSizes";
import { formatJsonPayload } from "@features/agent/utils/chat/messageContentParser";
import {
  AGENT_CHAT_TOOL_PREFIX_EXECUTING,
  AGENT_CHAT_TOOL_PREFIX_RESULT,
} from "@shared/utils/constants";

interface ChatToolCallMessageProps {
  messageText: string;
  messageId: string;
  fontSize: number;
  jsonData?: unknown;
  toolName?: string;
}

interface ParsedToolMessage {
  title: string;
  displayContent: string;
}

/**
 * Parses a tool message into a title and display body.
 * @param text - Raw tool message text.
 * @param jsonData - Optional structured JSON payload.
 * @param toolName - Optional tool name fallback.
 * @returns Parsed title and content for rendering.
 */
function parseToolMessage(
  text: string,
  jsonData?: unknown,
  toolName?: string
): ParsedToolMessage {
  if (jsonData !== undefined && jsonData !== null) {
    const prefix = text.startsWith(AGENT_CHAT_TOOL_PREFIX_RESULT)
      ? AGENT_CHAT_TOOL_PREFIX_RESULT
      : AGENT_CHAT_TOOL_PREFIX_EXECUTING;
    const resolvedToolName = toolName || text;
    const serialized = formatJsonPayload(jsonData);

    return {
      title: `${prefix}: ${resolvedToolName}`,
      displayContent: serialized,
    };
  }

  const parts = text.split(":").map((part) => part.trim());
  if (parts.length === 0) {
    return { title: "Tool", displayContent: text };
  }

  const type = parts[0];
  const resolvedToolName = parts.length > 1 ? parts[1] : "";
  const title = resolvedToolName ? `${type}: ${resolvedToolName}` : type;

  const colonIndex = text.indexOf(":");
  const displayContent =
    colonIndex > 0 ? text.substring(colonIndex + 1).trim() : text;

  return { title, displayContent };
}

/**
 * Collapsible tool execution/result card with terminal-style JSON body.
 * @param props - Tool message props.
 * @returns Tool call UI block.
 */
export const ChatToolCallMessage: React.FC<ChatToolCallMessageProps> = ({
  messageText,
  messageId,
  fontSize,
  jsonData,
  toolName,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const fontSizes = getFontSizes(fontSize);
  const { title, displayContent } = parseToolMessage(
    messageText,
    jsonData,
    toolName
  );

  /**
   * Toggles tool card expansion.
   */
  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  return (
    <View
      key={messageId}
      style={globalStyles.chatCollapsibleMessageContainer}
    >
      <TouchableOpacity
        style={globalStyles.chatCollapsibleMessageHeader}
        onPress={handleToggle}
        activeOpacity={0.7}
        accessibilityRole="button"
      >
        <Wrench size={16} color={tokens.colors.primary} />
        <Text
          style={[
            globalStyles.chatCollapsibleMessageTitle,
            { fontSize: fontSizes.base * 0.875 },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {isExpanded ? (
          <ChevronDown size={16} color={tokens.colors.text_secondary} />
        ) : (
          <ChevronRight size={16} color={tokens.colors.text_secondary} />
        )}
      </TouchableOpacity>

      {isExpanded && displayContent.length > 0 && (
        <ScrollView
          style={globalStyles.chatCollapsibleMessageCodePanel}
          contentContainerStyle={globalStyles.chatCollapsibleMessageCodeContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          <Text
            style={[
              globalStyles.chatCollapsibleMessageCodeText,
              { fontSize: fontSizes.base * 0.75 },
            ]}
            selectable
          >
            {displayContent}
          </Text>
        </ScrollView>
      )}
    </View>
  );
};
