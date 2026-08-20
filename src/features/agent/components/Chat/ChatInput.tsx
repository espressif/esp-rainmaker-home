/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  Image,
  ActivityIndicator,
  ScrollView,
  type TextInputContentSizeChangeEvent,
} from "react-native";
import { useTranslation } from "react-i18next";
import { ImagePlus, Send, X } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import {
  AGENT_CHAT_INPUT_LINE_HEIGHT,
  AGENT_CHAT_INPUT_MAX_HEIGHT,
  AGENT_CHAT_INPUT_MIN_HEIGHT,
} from "../../utils/constants";
import { ChatImageSourceBottomSheet } from "./ChatImageSourceBottomSheet";

interface PendingAttachmentPreview {
  uri: string;
}

interface ChatInputProps {
  inputText: string;
  isConnected: boolean;
  isAwaitingResponse: boolean;
  isUploadingMedia: boolean;
  isPickingImage: boolean;
  isLoadingMediaConfig: boolean;
  isImageAttachmentAllowed: boolean;
  canAddMoreAttachments: boolean;
  isImageSourcePickerVisible: boolean;
  pendingAttachments: PendingAttachmentPreview[];
  onInputChange: (text: string) => void;
  onAttachImage: () => void;
  onCloseImageSourcePicker: () => void;
  onPickImageFromCamera: () => void;
  onPickImageFromGallery: () => void;
  onRemoveAttachment: (index: number) => void;
  onSend: () => void;
  onReconnect: () => void;
}

/**
 * Chat input component with image attachment, send button, and connection banner.
 */
export const ChatInput: React.FC<ChatInputProps> = ({
  inputText,
  isConnected,
  isAwaitingResponse,
  isUploadingMedia,
  isPickingImage,
  isLoadingMediaConfig,
  isImageAttachmentAllowed,
  canAddMoreAttachments,
  isImageSourcePickerVisible,
  pendingAttachments,
  onInputChange,
  onAttachImage,
  onCloseImageSourcePicker,
  onPickImageFromCamera,
  onPickImageFromGallery,
  onRemoveAttachment,
  onSend,
  onReconnect,
}) => {
  const { t } = useTranslation();
  const hasPendingAttachments = pendingAttachments.length > 0;
  const canSend =
    isConnected &&
    !isAwaitingResponse &&
    !isUploadingMedia &&
    (Boolean(inputText.trim()) || hasPendingAttachments);
  const isAttachDisabled =
    !isConnected ||
    isAwaitingResponse ||
    isUploadingMedia ||
    isPickingImage ||
    isLoadingMediaConfig ||
    !isImageAttachmentAllowed ||
    !canAddMoreAttachments;
  const [inputContentHeight, setInputContentHeight] = useState(
    AGENT_CHAT_INPUT_MIN_HEIGHT,
  );
  const isInputScrollable = inputContentHeight >= AGENT_CHAT_INPUT_MAX_HEIGHT;
  const isSingleLineInput =
    !isInputScrollable && inputContentHeight <= AGENT_CHAT_INPUT_MIN_HEIGHT;
  const inputHeight = Math.min(
    Math.max(inputContentHeight, AGENT_CHAT_INPUT_MIN_HEIGHT),
    AGENT_CHAT_INPUT_MAX_HEIGHT,
  );

  useEffect(() => {
    if (!inputText) {
      setInputContentHeight(AGENT_CHAT_INPUT_MIN_HEIGHT);
    }
  }, [inputText]);

  /**
   * Grows or shrinks the composer height with content, capped at five lines.
   */
  const handleInputContentSizeChange = useCallback(
    (event: TextInputContentSizeChangeEvent) => {
      const nextHeight = Math.min(
        Math.max(event.nativeEvent.contentSize.height, AGENT_CHAT_INPUT_MIN_HEIGHT),
        AGENT_CHAT_INPUT_MAX_HEIGHT,
      );
      setInputContentHeight(nextHeight);
    },
    [],
  );

  return (
    <View style={globalStyles.chatInputContainer}>
      {!isConnected && (
        <View style={globalStyles.chatConnectionBanner}>
          <View style={globalStyles.chatConnectionBannerContent}>
            <View
              style={[
                globalStyles.chatConnectionBannerIndicator,
                { backgroundColor: tokens.colors.error },
              ]}
            />
            <Text style={globalStyles.chatConnectionBannerText}>
              {t("chat.disconnected")}
            </Text>
            <TouchableOpacity
              style={globalStyles.chatReconnectButtonInline}
              onPress={onReconnect}
              activeOpacity={0.7}
            >
              <Text style={globalStyles.chatReconnectTextInline}>
                {t("chat.reconnect")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {hasPendingAttachments && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={globalStyles.chatAttachmentPreviewScroll}
          contentContainerStyle={globalStyles.chatAttachmentPreviewScrollContent}
        >
          {pendingAttachments.map((attachment, index) => (
            <View
              key={`${attachment.uri}-${index}`}
              style={globalStyles.chatAttachmentPreviewItem}
            >
              <Image
                source={{ uri: attachment.uri }}
                style={globalStyles.chatAttachmentPreviewImage}
                accessibilityLabel={t("chat.attachedImage")}
              />
              {isUploadingMedia && (
                <View style={globalStyles.chatAttachmentPreviewUploadingOverlay}>
                  <ActivityIndicator size="small" color={tokens.colors.bg1} />
                </View>
              )}
              {!isUploadingMedia && (
                <TouchableOpacity
                  style={globalStyles.chatAttachmentRemoveButton}
                  onPress={() => onRemoveAttachment(index)}
                  accessibilityLabel={t("chat.removeAttachment")}
                  activeOpacity={0.7}
                >
                  <X size={14} color={tokens.colors.bg1} strokeWidth={2.5} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      <View
        style={[
          globalStyles.chatInputWrapper,
          isSingleLineInput && globalStyles.chatInputWrapperSingleLine,
        ]}
      >
        <TouchableOpacity
          style={[
            globalStyles.chatAttachButton,
            isAttachDisabled && globalStyles.chatAttachButtonDisabled,
            !isSingleLineInput && globalStyles.chatAttachButtonExpanded,
          ]}
          onPress={onAttachImage}
          disabled={isAttachDisabled}
          accessibilityLabel={t("chat.attachImage")}
          activeOpacity={0.7}
        >
          {isPickingImage ? (
            <ActivityIndicator size="small" color={tokens.colors.primary} />
          ) : (
            <ImagePlus
              size={20}
              color={
                isAttachDisabled
                  ? tokens.colors.text_secondary
                  : tokens.colors.primary
              }
              strokeWidth={2.2}
            />
          )}
        </TouchableOpacity>

        <View style={globalStyles.chatTextInputContainer}>
          <TextInput
            style={[
              globalStyles.chatTextInput,
              !isConnected && globalStyles.chatTextInputDisabled,
              {
                height: inputHeight,
                ...(Platform.OS === "ios" && isSingleLineInput
                  ? {
                      paddingTop:
                        (AGENT_CHAT_INPUT_MIN_HEIGHT -
                          AGENT_CHAT_INPUT_LINE_HEIGHT) /
                        2,
                    }
                  : null),
              },
            ]}
            value={inputText}
            onChangeText={onInputChange}
            onContentSizeChange={handleInputContentSizeChange}
            placeholder={
              isConnected
                ? t("chat.placeholder")
                : t("chat.notConnected")
            }
            placeholderTextColor={tokens.colors.text_secondary}
            multiline
            scrollEnabled={isInputScrollable}
            editable={isConnected && !isAwaitingResponse && !isUploadingMedia}
            returnKeyType="send"
            onSubmitEditing={onSend}
            blurOnSubmit={false}
            textAlignVertical={isSingleLineInput ? "center" : "top"}
          />
        </View>
        <TouchableOpacity
          style={[
            globalStyles.chatSendButton,
            canSend
              ? globalStyles.chatSendButtonActive
              : globalStyles.chatSendButtonDisabled,
          ]}
          onPress={onSend}
          disabled={!canSend}
          activeOpacity={0.7}
        >
          {isUploadingMedia ? (
            <ActivityIndicator size="small" color={tokens.colors.bg1} />
          ) : (
            <Send size={20} color={tokens.colors.bg1} strokeWidth={2.5} />
          )}
        </TouchableOpacity>
      </View>

      <ChatImageSourceBottomSheet
        visible={isImageSourcePickerVisible}
        onClose={onCloseImageSourcePicker}
        onTakePhoto={onPickImageFromCamera}
        onChooseFromGallery={onPickImageFromGallery}
      />
    </View>
  );
};
