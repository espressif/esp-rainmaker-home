/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from "react-native";
import { useTranslation } from "react-i18next";
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

interface ChatMenuDropdownProps {
  visible: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSettings: () => void;
  onConversations: () => void;
}

/**
 * Chat menu dropdown component
 * Displays options: New Chat and Settings
 */
export const ChatMenuDropdown: React.FC<ChatMenuDropdownProps> = ({
  visible,
  onClose,
  onNewChat,
  onSettings,
  onConversations,
}) => {
  const { t } = useTranslation();

  const handleNewChat = () => {
    onNewChat();
    onClose();
  };

  const handleSettings = () => {
    onSettings();
    onClose();
  };

  const handleConversations = () => {
    onConversations();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View
          style={[styles.menuContainer, globalStyles.shadowElevationForLightTheme]}
        >
          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleNewChat}
            activeOpacity={0.7}
          >
            <Text style={styles.menuItemText}>
              {t("chatSettings.newChat")}
            </Text>
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleConversations}
            activeOpacity={0.7}
          >
            <Text style={styles.menuItemText}>
              {t("chatSettings.conversations") || "Conversations"}
            </Text>
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleSettings}
            activeOpacity={0.7}
          >
            <Text style={styles.menuItemText}>
              {t("chatSettings.settings")}
            </Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 60,
    paddingRight: 16,
  },
  menuContainer: {
    backgroundColor: tokens.colors.white,
    borderRadius: 12,
    minWidth: 180,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  menuItemText: {
    fontSize: tokens.fontSize.md,
    color: tokens.colors.text_primary,
    fontFamily: tokens.fonts.medium,
    lineHeight: 20,
  },
  separator: {
    height: 1,
    backgroundColor: tokens.colors.bg3,
    marginHorizontal: 8,
  },
});

