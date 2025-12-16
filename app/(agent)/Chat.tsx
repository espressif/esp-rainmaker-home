/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";
import { ScreenWrapper, ConfirmationDialog } from "@/components";
import MessageDisplayConfigBottomSheet from "@/components/Modals/MessageDisplayConfigBottomSheet";
import {
  ChatMessage,
  ChatInput,
  ChatHeader,
  ChatErrorState,
  ChatLoadingState,
} from "@/components/Chat";
import { useCDF } from "@/hooks/useCDF";
import { useAgentChat } from "@/hooks/useAgentChat";
import { loadPreviousMessages } from "@/utils/chat/messageLoader";
import { getFontSizes } from "@/utils/chat/fontSizes";
import { deleteConversationId } from "@/utils/agent";
import type { ChatMessage as ChatMessageType } from "@/types/global";

const Chat = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { store } = useCDF();
  const hasInitializedRef = useRef(false);

  // Combined hook for all chat functionality
  const {
    // Agent
    isInitializing,
    agentError,
    isAgentConfigNotFound,
    isProfileNotFound,
    isConnectingConnector,
    isDefaultAgent,
    showConnectorWarningDialog,
    initializeAgent,
    handleConnectorWarningRetry,
    handleConnectorWarningContinue,
    // Config
    messageDisplayConfig,
    fontSize,
    saveConfig,
    loadMessageDisplayConfig,
    loadFontSize,
    // Input
    inputText,
    setInputText,
    inputHeight,
    setInputHeight,
    isKeyboardVisible,
    resetInput,
    // Messages
    messageHistory,
    setMessageHistory,
    expandedJsonMessages,
    isThinking,
    isConversationDone,
    setIsThinking,
    setIsConversationDone,
    addChatMessage,
    toggleJsonExpansion,
    clearMessages,
    // WebSocket
    isConnected,
    isConnecting,
    initializeWebSocket,
    sendMessage: sendWebSocketMessage,
    disconnect,
    // Scroll
    flatListRef,
    enableAutoScroll,
    handleScrollBeginDrag,
    handleScrollEndDrag,
    handleMomentumScrollEnd,
    handleContentSizeChange,
  } = useAgentChat();

  const [showConfigBottomSheet, setShowConfigBottomSheet] = useState(false);

  // Initialize chat
  useEffect(() => {
    initializeChat();

    return () => {
      disconnect();
    };
  }, []);

  // Reload config when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadMessageDisplayConfig();
      loadFontSize();

      // Reinitialize chat when returning from ChatSettings (after first initialization)
      if (hasInitializedRef.current) {
        disconnect();
        clearMessages();
        initializeChat();
      } else {
        hasInitializedRef.current = true;
      }
    }, [loadMessageDisplayConfig, loadFontSize, disconnect, clearMessages])
  );

  const initializeChat = async () => {
    await initializeAgent(async () => {
      // Step 1: Initialize WebSocket connection
      await initializeWebSocket();

      // Step 2: Load previous conversation messages
      if (store?.userStore) {
        await loadPreviousMessages(
          store.userStore,
          setMessageHistory,
          flatListRef
        );
      }
    });
  };

  // Handle profile not found - redirect to AgentTerms
  useEffect(() => {
    if (isProfileNotFound) {
      router.replace({
        pathname: "/(auth)/AgentTerms",
      } as any);
    }
  }, [isProfileNotFound, router]);

  const sendMessage = useCallback(
    (messageText?: string) => {
      const message = messageText || inputText.trim();
      if (!message || !isConnected) return;

      resetInput();
      enableAutoScroll();

      if (messageDisplayConfig.showUser) {
        addChatMessage(message, true, "user");
      }

      // Set thinking indicator immediately when sending message
      setIsThinking(true);
      setIsConversationDone(false);

      sendWebSocketMessage(message);
    },
    [
      inputText,
      isConnected,
      messageDisplayConfig.showUser,
      addChatMessage,
      sendWebSocketMessage,
      resetInput,
      enableAutoScroll,
      setIsThinking,
      setIsConversationDone,
    ]
  );

  const reconnect = async () => {
    disconnect();
    await initializeChat();
  };

  const handleNewChat = useCallback(async () => {
    try {
      // Disconnect WebSocket
      disconnect();

      // Clear all messages
      clearMessages();

      // Delete conversation ID from storage
      if (store?.userStore) {
        await deleteConversationId(store.userStore);
      }

      // Reinitialize chat (will show welcome message)
      await initializeChat();
    } catch (error) {
      console.error("Error starting new chat:", error);
      // Still reinitialize even if deletion fails
      await initializeChat();
    }
  }, [disconnect, clearMessages, store, initializeChat]);

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessageType }) => {
        return (
        <ChatMessage
          item={item}
          fontSize={fontSize}
          expandedJsonMessages={expandedJsonMessages}
          isDefaultAgent={isDefaultAgent}
          isConnected={isConnected}
          onToggleJson={toggleJsonExpansion}
          onQuestionPress={sendMessage}
        />
      );
    },
    [
      fontSize,
      expandedJsonMessages,
      isDefaultAgent,
      isConnected,
      toggleJsonExpansion,
      sendMessage,
    ]
  );

  return (
    <GestureHandlerRootView style={globalStyles.chatGestureContainer}>
      <ChatHeader
        isConnected={isConnected}
        isConnecting={isConnecting}
        onConfigPress={() => setShowConfigBottomSheet(true)}
        onNewChat={handleNewChat}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <ScreenWrapper
          style={globalStyles.chatContainer}
          excludeTop={true}
          dismissKeyboard={false}
        >
          {isInitializing ? (
            <ChatLoadingState isConnectingConnector={isConnectingConnector} />
          ) : agentError ? (
            <ChatErrorState
              error={agentError}
              isAgentConfigNotFound={isAgentConfigNotFound}
              onRetry={reconnect}
            />
          ) : (
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={globalStyles.chatInnerContainer}>
                {/* Messages List */}
                <FlatList
                  ref={flatListRef}
                  data={messageHistory}
                  renderItem={renderMessage}
                  keyExtractor={(item) => item.id}
                  style={globalStyles.chatMessagesList}
                  contentContainerStyle={[
                    globalStyles.chatMessagesContent,
                    isKeyboardVisible &&
                      globalStyles.chatMessagesContentKeyboardVisible,
                    messageHistory.length === 0 &&
                      globalStyles.chatMessagesContentEmpty,
                  ]}
                  showsVerticalScrollIndicator={true}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="interactive"
                  scrollEnabled={true}
                  bounces={true}
                  removeClippedSubviews={true}
                  maxToRenderPerBatch={10}
                  updateCellsBatchingPeriod={50}
                  windowSize={10}
                  initialNumToRender={20}
                  onScrollBeginDrag={handleScrollBeginDrag}
                  onScrollEndDrag={handleScrollEndDrag}
                  onMomentumScrollEnd={handleMomentumScrollEnd}
                  onContentSizeChange={handleContentSizeChange}
                  ListFooterComponent={
                    isThinking && !isConversationDone ? (
                      <View style={globalStyles.chatThinkingIndicatorWrapper}>
                        <View
                          style={globalStyles.chatThinkingIndicatorContainer}
                        >
                          <Text
                            style={[
                              globalStyles.chatThinkingIndicatorText,
                              { fontSize: getFontSizes(fontSize).base },
                            ]}
                          >
                            Thinking...
                          </Text>
                        </View>
                      </View>
                    ) : null
                  }
                />

                {/* Input Area */}
                <ChatInput
                  inputText={inputText}
                  inputHeight={inputHeight}
                  isConnected={isConnected}
                  isKeyboardVisible={isKeyboardVisible}
                  onInputChange={setInputText}
                  onInputHeightChange={setInputHeight}
                  onSend={() => sendMessage()}
                  onReconnect={reconnect}
                />
              </View>
            </TouchableWithoutFeedback>
          )}
        </ScreenWrapper>
      </KeyboardAvoidingView>

      {/* Message Display Config Bottom Sheet */}
      <MessageDisplayConfigBottomSheet
        visible={showConfigBottomSheet}
        onClose={() => setShowConfigBottomSheet(false)}
        config={messageDisplayConfig}
        onSave={saveConfig}
      />

      {/* Connector Warning Dialog */}
      <ConfirmationDialog
        open={showConnectorWarningDialog}
        title={t("chat.rainmakerMCPNotConnected")}
        description={t("chat.rainmakerMCPWarning")}
        confirmText={t("chat.retry")}
        cancelText={t("chat.continue")}
        onConfirm={handleConnectorWarningRetry}
        onCancel={handleConnectorWarningContinue}
        confirmColor={tokens.colors.primary}
      />
    </GestureHandlerRootView>
  );
};

export default Chat;
