/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Trash2 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useCDF } from "@/hooks/useCDF";
import { useToast } from "@/hooks/useToast";
import { useAgentChat } from "@/hooks/useAgentChat";
import { getConversationId, saveConversationId } from "@/utils/agent";
import type { AgentConversationsBottomSheetProps, ConversationListItem } from "@/types/global";
import { tokens } from "@/theme/tokens";
import { agentConversationsSheetStyles } from "@/theme/globalStyleSheet";

export const AgentConversationsBottomSheet: React.FC<
  AgentConversationsBottomSheetProps
> = ({
  visible,
  agentId,
  onClose,
  onSelectConversation,
  showActiveStatus = true,
  allowActivation = true,
}) => {
  const { t } = useTranslation();
  const { store } = useCDF();
  const { height } = useWindowDimensions();
  const toast = useToast();
  const {
    conversations,
    isLoadingConversations,
    loadConversationsForAgent,
    deleteConversationForAgent,
  } = useAgentChat();
  

  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null
  );
  const [isSelecting, setIsSelecting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadActiveConversationId = useCallback(async () => {
    if (!store?.userStore) return;
    try {
      const id = await getConversationId(store.userStore);
      setActiveConversationId(id || null);
    } catch {
      setActiveConversationId(null);
    }
  }, [store]);

  const loadData = useCallback(async () => {
    if (!agentId) return;
    try {
      if (showActiveStatus) {
        await Promise.all([
          loadConversationsForAgent(agentId),
          loadActiveConversationId(),
        ]);
      } else {
        await loadConversationsForAgent(agentId);
        setActiveConversationId(null);
      }
    } catch (error) {
      console.error("Failed to load conversations data:", error);
    }
  }, [
    agentId,
    showActiveStatus,
    loadConversationsForAgent,
    loadActiveConversationId,
  ]);

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible, loadData]);

  const handleSelect = async (item: ConversationListItem) => {
    try {
      setIsSelecting(true);
      // If activation is allowed, mark this conversation as active in user data
      if (allowActivation && store?.userStore) {
        await saveConversationId(item.conversationId, store.userStore);
        setActiveConversationId(item.conversationId);
      }

      // Always notify parent about selection so it can decide what to do
      await onSelectConversation(item);

      // Close sheet after selection
      onClose();
    } catch (error: any) {
      console.error("Failed to activate conversation:", error);
      toast.showError(
        t("chat.conversations.activateErrorTitle") || "Failed to open conversation",
        error?.message ||
          t("chat.conversations.activateErrorMessage") ||
          "Something went wrong while opening the conversation."
      );
    } finally {
      setIsSelecting(false);
    }
  };

  const handleDelete = async (item: ConversationListItem) => {
    if (!agentId || item.conversationId === activeConversationId) {
      return;
    }
    try {
      setDeletingId(item.conversationId);
      await deleteConversationForAgent(agentId, item.conversationId);
      toast.showSuccess(
        t("chat.conversations.deleteSuccessTitle") || "Conversation deleted",
        t("chat.conversations.deleteSuccessMessage") ||
          "The conversation has been deleted successfully."
      );
    } catch (error: any) {
      console.error("Failed to delete conversation:", error);
      toast.showError(
        t("chat.conversations.deleteErrorTitle") || "Failed to delete",
        error?.message ||
          t("chat.conversations.deleteErrorMessage") ||
          "Failed to delete the conversation. Please try again."
      );
    } finally {
      setDeletingId(null);
    }
  };

  const renderItem = ({ item }: { item: ConversationListItem }) => {
    const isActive =
      showActiveStatus && item.conversationId === activeConversationId;
    const isDeleting = deletingId === item.conversationId;

    return (
      <TouchableOpacity
      style={[
          agentConversationsSheetStyles.itemContainer,
          isActive && agentConversationsSheetStyles.itemContainerActive,
        ]}
        activeOpacity={0.7}
        onPress={() => handleSelect(item)}
        disabled={isSelecting || isDeleting}
      >
        <View style={agentConversationsSheetStyles.itemTextContainer}>
          <Text style={agentConversationsSheetStyles.itemTitle} numberOfLines={1}>
            {item.title || t("chat.conversations.untitled") || "Untitled conversation"}
          </Text>
          <Text style={agentConversationsSheetStyles.itemSubtitle} numberOfLines={1}>
            {t("chat.conversations.messagesCount", {
              count: item.messageCount,
            }) || `${item.messageCount} messages`}
          </Text>
        </View>

        <View style={agentConversationsSheetStyles.itemActions}>
          {isActive && (
            <Text style={agentConversationsSheetStyles.activeBadge}>
              {t("chat.conversations.active") || "Active"}
            </Text>
          )}

          {!isActive && (
            <TouchableOpacity
              style={agentConversationsSheetStyles.deleteButton}
              onPress={() => handleDelete(item)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color={tokens.colors.red} />
              ) : (
                <Trash2 size={18} color={tokens.colors.red} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={agentConversationsSheetStyles.backdrop}>
        <View
          style={[agentConversationsSheetStyles.sheetContainer, { maxHeight: height * 0.7 }]}
        >
          <View style={agentConversationsSheetStyles.header}>
            <Text style={agentConversationsSheetStyles.headerTitle}>
              {t("chat.conversations.title") || "Conversations"}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={agentConversationsSheetStyles.closeText}>
                {t("common.close") || "Close"}
              </Text>
            </TouchableOpacity>
          </View>

          {isLoadingConversations ? (
            <View style={agentConversationsSheetStyles.loadingContainer}>
              <ActivityIndicator size="small" />
              <Text style={agentConversationsSheetStyles.loadingText}>
                {t("chat.conversations.loading") || "Loading conversations..."}
              </Text>
            </View>
          ) : conversations.length === 0 ? (
            <View style={agentConversationsSheetStyles.emptyContainer}>
              <Text style={agentConversationsSheetStyles.emptyText}>
                {t("chat.conversations.empty") || "No conversations yet."}
              </Text>
            </View>
          ) : (
            <FlatList
              data={conversations}
              keyExtractor={(item) => item.conversationId}
              renderItem={renderItem}
              contentContainerStyle={agentConversationsSheetStyles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};
