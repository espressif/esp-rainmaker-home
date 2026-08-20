/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { FlatList } from "react-native-gesture-handler";
import { useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView, GestureDetector } from "react-native-gesture-handler";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { ScreenWrapper, ConfirmationDialog } from "@shared/components";
import {
  AgentConversationsBottomSheet,
  AgentTermsBottomSheet,
  ChatErrorState,
  ChatHeader,
  ChatInput,
  ChatUsageStrip,
  ChatLoadingState,
  ChatMessage,
  MessageDisplayConfigBottomSheet,
} from "@features/agent/components";
import { getAgentTermsAccepted } from "@features/agent/utils/storage";
import { useCDF } from "@shared/hooks/useCDF";
import { useAgentChat, useChatMediaAttachment, useAgentUsageReveal } from "@features/agent/hooks";
import { loadPreviousMessages } from "@features/agent/utils/chat/messageLoader";
import { buildChatDisplayMessages, shouldShowChatThinkingIndicator } from "@features/agent/utils/chat/messageOrdering";
import { getSelectedAgentId, deleteConversationId, getAgentSuggestionPrompts } from "@features/agent/utils";
import { ChatMessage as ChatMessageType } from "@src/types/global";

/**
 * ChatScreen component
 * @returns Chat screen UI
 */
export function ChatScreen() {
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
    isKeyboardVisible,
    resetInput,
    // Messages
    messageHistory,
    setMessageHistory,
    setIsConversationDone,
    addChatMessage,
    clearMessages,
    // WebSocket
    isConnected,
    isConnecting,
    initializeWebSocket,
    sendMessage: sendWebSocketMessage,
    disconnect,
    isUploadingMedia,
    // Scroll
    flatListRef,
    handleScrollBeginDrag,
    handleScrollEndDrag,
    handleMomentumScrollEnd,
    handleContentSizeChange,
    handleScrollToIndexFailed,
    showThinkingIndicator,
    isTransactionActive,
  } = useAgentChat();

  const [showConfigBottomSheet, setShowConfigBottomSheet] = useState(false);
  const [showTermsBottomSheet, setShowTermsBottomSheet] = useState(false);
  const [showConversationsBottomSheet, setShowConversationsBottomSheet] =
    useState(false);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);

  const showIndicatorInList = useMemo(
    () =>
      shouldShowChatThinkingIndicator(
        showThinkingIndicator,
        messageDisplayConfig
      ),
    [showThinkingIndicator, messageDisplayConfig]
  );

  const displayMessages = useMemo(
    () => buildChatDisplayMessages(messageHistory, showIndicatorInList),
    [messageHistory, showIndicatorInList]
  );

  const isNewConversation = useMemo(
    () => !messageHistory.some((message) => message.isUser),
    [messageHistory]
  );

  const suggestionPrompts = useMemo(
    () => (currentAgentId ? getAgentSuggestionPrompts(currentAgentId) : []),
    [currentAgentId]
  );

  const user = store?.userStore.user;

  const {
    pendingAttachments,
    canAddMoreAttachments,
    isPickingImage,
    isLoadingMediaConfig,
    isImageAttachmentAllowed,
    isImageSourcePickerVisible,
    openImageAttachmentPicker,
    closeImageAttachmentPicker,
    pickImageFromCamera,
    pickImageFromGallery,
    removeAttachmentAt,
    clearAttachments,
  } = useChatMediaAttachment(currentAgentId);

  const {
    isVisible: isUsageStripVisible,
    usage: usageQuota,
    hideUsageStrip,
    toggleUsageStrip,
    doubleTapGesture,
  } = useAgentUsageReveal();

  // Initialize chat
  useEffect(() => {
    initializeChat();

    return () => {
      disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, []);

  // Reload config when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadMessageDisplayConfig();
      loadFontSize();

      // Check if terms are accepted
      if (user) {
        const termsAccepted = getAgentTermsAccepted(user);
        if (!termsAccepted) {
          setShowTermsBottomSheet(true);
          return; // Don't initialize chat until terms are accepted
        }
      }

      // Reinitialize chat when returning from ChatSettings (after first initialization)
      if (hasInitializedRef.current) {
        disconnect();
        clearMessages();
        initializeChat();
      } else {
        hasInitializedRef.current = true;
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
    }, [loadMessageDisplayConfig, loadFontSize, disconnect, clearMessages]),
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  const initializeChat = async () => {
    await initializeAgent(async () => {
      // Step 1: Determine current agent and store it
      if (user) {
        const agentId = await getSelectedAgentId(user);
        setCurrentAgentId(agentId);
      }

      // Step 2: Initialize WebSocket connection
      await initializeWebSocket();

      // Step 3: Load previous conversation messages
      if (user) {
        await loadPreviousMessages(user, setMessageHistory, flatListRef);
      }
    });
  };

  // Handle profile not found - show terms bottom sheet
  useEffect(() => {
    if (isProfileNotFound) {
      setShowTermsBottomSheet(true);
    }
  }, [isProfileNotFound]);

  const sendMessage = useCallback(
    async (messageText?: string) => {
      const message = messageText || inputText.trim();
      const hasAttachment = pendingAttachments.length > 0;

      if ((!message && !hasAttachment) || !isConnected || isUploadingMedia || isTransactionActive) {
        return;
      }

      hideUsageStrip();

      const attachmentsToSend = hasAttachment ? [...pendingAttachments] : [];
      setIsConversationDone(false);

      try {
        const uploadedMedia = await sendWebSocketMessage(
          message,
          attachmentsToSend
        );

        resetInput();
        clearAttachments();

        if (messageDisplayConfig.showUser) {
          addChatMessage(
            message,
            true,
            "user",
            undefined,
            undefined,
            uploadedMedia
          );
        }
      } catch {
        // Error toast is handled in useAgentChat; keep pending attachment.
      }
    },
    [
      inputText,
      pendingAttachments,
      isConnected,
      isUploadingMedia,
      isTransactionActive,
      messageDisplayConfig.showUser,
      addChatMessage,
      sendWebSocketMessage,
      resetInput,
      clearAttachments,
      setIsConversationDone,
      hideUsageStrip,
    ],
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
      if (user) {
        await deleteConversationId(user);
      }

      // Reinitialize chat (will show welcome message)
      await initializeChat();
    } catch (error) {
      console.error("Error starting new chat:", error);
      // Still reinitialize even if deletion fails
      await initializeChat();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, [disconnect, clearMessages, store, initializeChat]);

  const handleSelectConversation = useCallback(async () => {
    try {
      // Close the conversations bottom sheet immediately after selection
      setShowConversationsBottomSheet(false);

      // Disconnect WebSocket and clear messages for clean state
      disconnect();
      clearMessages();

      // Reinitialize chat which will use the updated conversation ID
      await initializeChat();
    } catch (error) {
      console.error("Error switching conversation:", error);
      await initializeChat();
    }
  }, [disconnect, clearMessages, initializeChat]);

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessageType }) => {
      return (
        <ChatMessage
          item={item}
          fontSize={fontSize}
          isConnected={isConnected}
          onQuestionPress={sendMessage}
          suggestionPrompts={suggestionPrompts}
          showSuggestionPrompts={isNewConversation}
        />
      );
    },
    [
      fontSize,
      isConnected,
      sendMessage,
      suggestionPrompts,
      isNewConversation,
    ],
  );

  return (
    <GestureHandlerRootView style={globalStyles.chatGestureContainer}>
      <ChatHeader
        isConnected={isConnected}
        isConnecting={isConnecting}
        onConfigPress={() => setShowConfigBottomSheet(true)}
        onNewChat={handleNewChat}
        onOpenConversations={() => setShowConversationsBottomSheet(true)}
        onViewQuota={toggleUsageStrip}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <ScreenWrapper
          style={globalStyles.chatContainer}
          excludeTop={true}
          excludeBottom={Platform.OS === "ios"}
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
            <GestureDetector gesture={doubleTapGesture}>
              <View style={globalStyles.chatInnerContainer}>
                <FlatList
                  ref={flatListRef}
                  data={displayMessages}
                  renderItem={renderMessage}
                  keyExtractor={(item) => item.id}
                  style={globalStyles.chatMessagesList}
                  contentContainerStyle={[
                    globalStyles.chatMessagesContent,
                    isKeyboardVisible &&
                      globalStyles.chatMessagesContentKeyboardVisible,
                    displayMessages.length === 0 &&
                      globalStyles.chatMessagesContentEmpty,
                  ]}
                  showsVerticalScrollIndicator={true}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  scrollEnabled={true}
                  alwaysBounceVertical={true}
                  overScrollMode="always"
                  bounces={true}
                  nestedScrollEnabled={true}
                  removeClippedSubviews={false}
                  maxToRenderPerBatch={10}
                  updateCellsBatchingPeriod={50}
                  windowSize={10}
                  initialNumToRender={20}
                  onScrollBeginDrag={handleScrollBeginDrag}
                  onScrollEndDrag={handleScrollEndDrag}
                  onMomentumScrollEnd={handleMomentumScrollEnd}
                  onContentSizeChange={handleContentSizeChange}
                  onScrollToIndexFailed={handleScrollToIndexFailed}
                />

                <View
                  style={[
                    globalStyles.chatInputArea,
                    Platform.OS === "ios" && !isKeyboardVisible
                      ? { paddingBottom: insets.bottom }
                      : undefined,
                  ]}
                >
                  {isUsageStripVisible && usageQuota ? (
                    <ChatUsageStrip usage={usageQuota} />
                  ) : null}

                  <ChatInput
                    inputText={inputText}
                    isConnected={isConnected}
                    isAwaitingResponse={isTransactionActive}
                    isUploadingMedia={isUploadingMedia}
                    isPickingImage={isPickingImage}
                    isLoadingMediaConfig={isLoadingMediaConfig}
                    isImageAttachmentAllowed={isImageAttachmentAllowed}
                    canAddMoreAttachments={canAddMoreAttachments}
                    pendingAttachments={pendingAttachments.map((attachment) => ({
                      uri: attachment.uri,
                    }))}
                    onInputChange={setInputText}
                    onAttachImage={openImageAttachmentPicker}
                    isImageSourcePickerVisible={isImageSourcePickerVisible}
                    onCloseImageSourcePicker={closeImageAttachmentPicker}
                    onPickImageFromCamera={() => {
                      void pickImageFromCamera();
                    }}
                    onPickImageFromGallery={() => {
                      void pickImageFromGallery();
                    }}
                    onRemoveAttachment={removeAttachmentAt}
                    onSend={() => {
                      void sendMessage();
                    }}
                    onReconnect={reconnect}
                  />
                </View>
              </View>
            </GestureDetector>
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

      {/* Agent Terms Bottom Sheet */}
      <AgentTermsBottomSheet
        visible={showTermsBottomSheet}
        onClose={() => {
          setShowTermsBottomSheet(false);
          router.back();
        }}
        onComplete={() => {
          setShowTermsBottomSheet(false);
          // Initialize chat after terms are accepted
          if (!hasInitializedRef.current) {
            hasInitializedRef.current = true;
          }
          initializeChat();
        }}
        allowClose={true}
      />

      {/* Agent Conversations Bottom Sheet */}
      <AgentConversationsBottomSheet
        visible={showConversationsBottomSheet}
        agentId={currentAgentId}
        onClose={() => setShowConversationsBottomSheet(false)}
        onSelectConversation={handleSelectConversation}
      />
    </GestureHandlerRootView>
  );
}
