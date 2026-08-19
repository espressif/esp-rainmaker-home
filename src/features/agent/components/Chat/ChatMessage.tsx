/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from "react";
import { View, Text, Image, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { ImageIcon } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { getFontSizes } from "@features/agent/utils/chat/fontSizes";
import { ChatMessageContent } from "./ChatMessageContent";
import { ChatToolCallMessage } from "./ChatToolCallMessage";
import { ChatSystemMessage } from "./ChatSystemMessage";
import { ChatJsonViewer } from "./ChatJsonViewer";
import { ChatQuestionSuggestions } from "./ChatQuestionSuggestions";
import { ChatThinkingIndicator } from "./ChatThinkingIndicator";
import { ChatMediaPreviewModal } from "./ChatMediaPreviewModal";
import {
  AGENT_CHAT_MESSAGE_TYPE_SYSTEM,
  AGENT_CHAT_MESSAGE_TYPE_THINKING,
  AGENT_CHAT_MESSAGE_TYPE_THINKING_INDICATOR,
  AGENT_WS_MESSAGE_TYPE_HANDSHAKE,
  AGENT_WS_MESSAGE_TYPE_HANDSHAKE_ACK,
  AGENT_WS_MESSAGE_TYPE_TOOL_CALL_INFO,
  AGENT_WS_MESSAGE_TYPE_TOOL_RESULT_INFO,
  AGENT_WS_MESSAGE_TYPE_USAGE_INFO,
  AGENT_WS_MESSAGE_TYPE_TIMEOUT,
} from "@shared/utils/constants";
import type { ChatMessage as ChatMessageType, ChatMediaAttachment } from "@src/types/global";

interface ChatMessageProps {
  item: ChatMessageType;
  fontSize: number;
  isConnected: boolean;
  onQuestionPress: (question: string) => void;
  suggestionPrompts?: string[];
  showSuggestionPrompts?: boolean;
}

/**
 * Chat message component that renders user-dashboard-style bubbles and tool cards.
 * @param props - Message item and interaction callbacks.
 * @returns Message row UI for a single chat entry.
 */
export const ChatMessage: React.FC<ChatMessageProps> = ({
  item,
  fontSize,
  isConnected,
  onQuestionPress,
  suggestionPrompts = [],
  showSuggestionPrompts = false,
}) => {
  const { t } = useTranslation();
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const fontSizes = getFontSizes(fontSize);
  const isAssistant =
    item.messageType === "assistant" && !item.isUser;
  const isThinking = item.messageType === AGENT_CHAT_MESSAGE_TYPE_THINKING;
  const isToolCall = item.messageType === AGENT_WS_MESSAGE_TYPE_TOOL_CALL_INFO;
  const isToolResult = item.messageType === AGENT_WS_MESSAGE_TYPE_TOOL_RESULT_INFO;
  const isUsageInfo = item.messageType === AGENT_WS_MESSAGE_TYPE_USAGE_INFO;
  const isHandshake = item.messageType === AGENT_WS_MESSAGE_TYPE_HANDSHAKE;
  const isHandshakeAck = item.messageType === AGENT_WS_MESSAGE_TYPE_HANDSHAKE_ACK;
  const isTimeout = item.messageType === AGENT_WS_MESSAGE_TYPE_TIMEOUT;
  const isSystem = item.messageType === AGENT_CHAT_MESSAGE_TYPE_SYSTEM;
  const hasJsonData = item.jsonData !== undefined && item.jsonData !== null;

  const jsonMessageTitle = useMemo(() => {
    if (isUsageInfo) {
      return t("chat.jsonMessageUsageInfo");
    }
    if (isHandshake) {
      return t("chat.jsonMessageHandshake");
    }
    if (isHandshakeAck) {
      return t("chat.jsonMessageHandshakeAck");
    }
    return t("chat.jsonMessageDetails");
  }, [isUsageInfo, isHandshake, isHandshakeAck, t]);

  const isWelcomeMessage =
    isAssistant && !item.isUser && item.id.startsWith("welcome-");

  /**
   * Renders a full-width media attachment above the user text bubble.
   * @param media - Attachment metadata.
   * @param index - Attachment index for React keys.
   * @returns Media preview element.
   */
  const renderMediaAttachment = (
    media: ChatMediaAttachment,
    index: number
  ) => {
    if (media.localUri) {
      return (
        <Pressable
          key={`${media.mediaId}-${index}`}
          onPress={() => setPreviewUri(media.localUri ?? null)}
          accessibilityRole="imagebutton"
          accessibilityLabel={media.filename}
        >
          <Image
            source={{ uri: media.localUri }}
            style={globalStyles.chatMessageImage}
          />
        </Pressable>
      );
    }

    return (
      <View
        key={`${media.mediaId}-${index}`}
        style={globalStyles.chatMessageImagePlaceholder}
      >
        <ImageIcon size={18} color={tokens.colors.text_secondary} />
        <Text
          style={globalStyles.chatMessageImagePlaceholderText}
          numberOfLines={1}
        >
          {media.filename}
        </Text>
      </View>
    );
  };

  if (item.messageType === AGENT_CHAT_MESSAGE_TYPE_THINKING_INDICATOR) {
    return (
      <View style={globalStyles.chatBotMessageWrapper}>
        <View style={globalStyles.chatThinkingIndicatorWrapper}>
          <ChatThinkingIndicator isVisible fontSize={fontSize} />
        </View>
      </View>
    );
  }

  if (isThinking) {
    return (
      <View style={globalStyles.chatBotMessageWrapper}>
        <View style={globalStyles.chatAssistantMessageContainer}>
          <ChatMessageContent
            content={item.text}
            isUser={false}
            messageType={AGENT_CHAT_MESSAGE_TYPE_THINKING}
            fontSize={fontSize}
          />
        </View>
      </View>
    );
  }

  if (isSystem) {
    return <ChatSystemMessage text={item.text} fontSize={fontSize} />;
  }

  if (isToolCall || isToolResult) {
    return (
      <View style={globalStyles.chatBotMessageWrapper}>
        <ChatToolCallMessage
          messageText={item.text}
          messageId={item.id}
          fontSize={fontSize}
          jsonData={isToolResult ? item.jsonData : undefined}
          toolName={item.toolName}
        />
      </View>
    );
  }

  if ((isUsageInfo || isHandshake || isHandshakeAck) && hasJsonData) {
    return (
      <View style={globalStyles.chatBotMessageWrapper}>
        <ChatJsonViewer
          data={item.jsonData}
          messageId={item.id}
          title={jsonMessageTitle}
          fontSize={fontSize}
        />
      </View>
    );
  }

  if (isTimeout) {
    return (
      <View style={globalStyles.chatSystemMessageWrapper}>
        <View style={globalStyles.chatTimeoutChip}>
          <Text
            style={[
              globalStyles.chatTimeoutMessageText,
              { fontSize: fontSizes.base },
            ]}
          >
            {item.text}
          </Text>
        </View>
      </View>
    );
  }

  if (item.isUser) {
    const hasMedia = (item.media?.length ?? 0) > 0;

    return (
      <>
        <View style={globalStyles.chatUserMessageWrapper}>
          {hasMedia ? (
            <View style={globalStyles.chatUserMediaStack}>
              {item.media?.map((media, index) =>
                renderMediaAttachment(media, index)
              )}
            </View>
          ) : null}
          {item.text ? (
            <View style={globalStyles.chatUserBubble}>
              <ChatMessageContent
                content={item.text}
                isUser
                messageType="user"
                fontSize={fontSize}
              />
            </View>
          ) : null}
        </View>
        <ChatMediaPreviewModal
          visible={previewUri !== null}
          uri={previewUri}
          onClose={() => setPreviewUri(null)}
        />
      </>
    );
  }

  return (
    <View>
      <View style={globalStyles.chatBotMessageWrapper}>
        <View style={globalStyles.chatAssistantMessageContainer}>
          <ChatMessageContent
            content={item.text}
            isUser={false}
            messageType={item.messageType}
            fontSize={fontSize}
          />
        </View>
      </View>
      {isWelcomeMessage &&
        showSuggestionPrompts &&
        isConnected &&
        suggestionPrompts.length > 0 && (
        <ChatQuestionSuggestions
          questions={suggestionPrompts}
          onQuestionPress={onQuestionPress}
        />
      )}
    </View>
  );
};
