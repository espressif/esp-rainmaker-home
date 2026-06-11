/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Markdown from "react-native-markdown-display";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { getChatMarkdownStyles } from "@features/agent/theme/chatMarkdownStyles";
import { getFontSizes } from "@features/agent/utils/chat/fontSizes";
import { stripThinkingPrefix } from "@features/agent/utils/chat/messageContentParser";
import {
  AGENT_CHAT_MESSAGE_TYPE_SYSTEM,
  AGENT_CHAT_MESSAGE_TYPE_THINKING,
  AGENT_CHAT_MESSAGE_TYPE_TOOL,
} from "@shared/utils/constants";

interface ChatMessageContentProps {
  content: string;
  isUser: boolean;
  messageType?: string;
  fontSize: number;
}

/**
 * Renders chat message body text with type-specific formatting.
 * User and system messages use plain text; assistant uses markdown;
 * thinking messages use a collapsible summary block aligned with user-dashboard.
 * @param props - Message content props.
 * @returns Rendered message body.
 */
export const ChatMessageContent: React.FC<ChatMessageContentProps> = ({
  content,
  isUser,
  messageType,
  fontSize,
}) => {
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
  const fontSizes = getFontSizes(fontSize);
  const thinkingFontSize = fontSizes.base * 0.85;

  if (messageType === AGENT_CHAT_MESSAGE_TYPE_THINKING) {
    const body = stripThinkingPrefix(content);

    return (
      <View style={globalStyles.chatThinkingCollapsible}>
        <TouchableOpacity
          style={globalStyles.chatThinkingCollapsibleHeader}
          onPress={() => setIsThinkingExpanded((prev) => !prev)}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text
            style={[
              globalStyles.chatThinkingCollapsibleTitle,
              { fontSize: thinkingFontSize },
            ]}
          >
            {isThinkingExpanded ? "▾ " : "▸ "}
            Thinking…
          </Text>
        </TouchableOpacity>
        {isThinkingExpanded && (
          <Text
            style={[
              globalStyles.chatThinkingCollapsibleBody,
              { fontSize: thinkingFontSize },
            ]}
          >
            {body}
          </Text>
        )}
      </View>
    );
  }

  if (
    isUser ||
    messageType === AGENT_CHAT_MESSAGE_TYPE_TOOL ||
    messageType === AGENT_CHAT_MESSAGE_TYPE_SYSTEM
  ) {
    return (
      <Text
        style={[
          globalStyles.chatPlainMessageText,
          isUser && globalStyles.chatUserMessageText,
          !isUser && globalStyles.chatBotMessageText,
          messageType === AGENT_CHAT_MESSAGE_TYPE_TOOL &&
            globalStyles.chatToolPlainText,
          { fontSize: fontSizes.base, lineHeight: fontSizes.lineHeight },
        ]}
      >
        {content}
      </Text>
    );
  }

  const markdownStyles = getChatMarkdownStyles(false, fontSizes);

  return (
    <Markdown
      style={markdownStyles}
      mergeStyle
    >
      {content}
    </Markdown>
  );
};
