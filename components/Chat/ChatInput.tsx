/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { Send } from "lucide-react-native";
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

interface ChatInputProps {
  inputText: string;
  inputHeight: number;
  isConnected: boolean;
  isKeyboardVisible: boolean;
  onInputChange: (text: string) => void;
  onInputHeightChange: (height: number) => void;
  onSend: () => void;
  onReconnect: () => void;
}

/**
 * Chat input component with send button and connection banner
 */
export const ChatInput: React.FC<ChatInputProps> = ({
  inputText,
  inputHeight,
  isConnected,
  isKeyboardVisible,
  onInputChange,
  onInputHeightChange,
  onSend,
  onReconnect,
}) => {
  const { t } = useTranslation();

  return (
    <View
      style={[
        globalStyles.chatInputContainer,
        isKeyboardVisible && globalStyles.chatInputContainerKeyboardVisible,
      ]}
    >
      {/* Connection Status Banner */}
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

      {/* Input Wrapper */}
      <View style={globalStyles.chatInputWrapper}>
        <View
          style={[
            globalStyles.chatTextInputContainer,
            { height: Math.min(Math.max(inputHeight, 44), 108) },
          ]}
        >
          <TextInput
            style={[
              globalStyles.chatTextInput,
              !isConnected && globalStyles.chatTextInputDisabled,
            ]}
            value={inputText}
            onChangeText={onInputChange}
            placeholder={
              isConnected
                ? t("chat.placeholder")
                : t("chat.notConnected")
            }
            placeholderTextColor={tokens.colors.text_secondary}
            multiline
            editable={isConnected}
            returnKeyType="send"
            onSubmitEditing={onSend}
            blurOnSubmit={false}
            textAlignVertical="top"
            onContentSizeChange={(event) => {
              const { height } = event.nativeEvent.contentSize;
              // Add padding (10 top + 10 bottom = 20)
              onInputHeightChange(height + 20);
            }}
          />
        </View>
        <TouchableOpacity
          style={[
            globalStyles.chatSendButton,
            isConnected && inputText.trim()
              ? globalStyles.chatSendButtonActive
              : globalStyles.chatSendButtonDisabled,
          ]}
          onPress={onSend}
          disabled={!isConnected || !inputText.trim()}
          activeOpacity={0.7}
        >
          <Send size={20} color={tokens.colors.bg1} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

