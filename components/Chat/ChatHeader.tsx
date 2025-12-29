/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useCallback, useState } from "react";
import { View, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { MoreVertical } from "lucide-react-native";
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";
import { Header } from "@/components";
import { ChatMenuDropdown } from "./ChatMenuDropdown";

interface ChatHeaderProps {
  isConnected: boolean;
  isConnecting: boolean;
  onConfigPress: () => void;
  onNewChat: () => void;
  onOpenConversations: () => void;
}

/**
 * Chat header component with connection indicator and dropdown menu
 */
export const ChatHeader: React.FC<ChatHeaderProps> = ({
  isConnected,
  isConnecting,
  onConfigPress,
  onNewChat,
  onOpenConversations,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const headerTapCountRef = useRef(0);
  const headerTapTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleHeaderTitlePress = useCallback(() => {
    headerTapCountRef.current += 1;

    // Clear existing timer
    if (headerTapTimerRef.current) {
      clearTimeout(headerTapTimerRef.current);
    }

    // Reset counter after 2 seconds of inactivity
    headerTapTimerRef.current = setTimeout(() => {
      headerTapCountRef.current = 0;
    }, 2000);

    // Open bottom sheet after 10 taps
    if (headerTapCountRef.current >= 10) {
      headerTapCountRef.current = 0;
      if (headerTapTimerRef.current) {
        clearTimeout(headerTapTimerRef.current);
        headerTapTimerRef.current = null;
      }
      onConfigPress();
    }
  }, [onConfigPress]);

  const handleSettingsPress = () => {
    router.push("/(agent)/ChatSettings");
  };

  return (
    <>
      <Header
        label={t("chat.title")}
        showBack={true}
        onLabelPress={handleHeaderTitlePress}
        rightSlot={
          <View style={globalStyles.chatHeaderRight}>
            {isConnecting ? (
              <ActivityIndicator size="small" color={tokens.colors.primary} />
            ) : (
              <View
                style={[
                  globalStyles.chatConnectionDot,
                  {
                    backgroundColor: isConnected
                      ? tokens.colors.success
                      : tokens.colors.error,
                  },
                ]}
              />
            )}
            <TouchableOpacity
              style={globalStyles.chatHeaderSettingsButton}
              onPress={() => setShowMenu(true)}
              activeOpacity={0.7}
            >
              <MoreVertical size={18} color={tokens.colors.text_secondary} />
            </TouchableOpacity>
          </View>
        }
      />
      <ChatMenuDropdown
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        onNewChat={onNewChat}
        onSettings={handleSettingsPress}
        onConversations={onOpenConversations}
      />
    </>
  );
};

