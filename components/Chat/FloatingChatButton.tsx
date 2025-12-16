/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '@/theme/tokens';

interface FloatingChatButtonProps {
  style?: any;
}

const FloatingChatButton: React.FC<FloatingChatButtonProps> = ({ style }) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handlePress = () => {
    router.push('/(agent)/Chat');
  };

  // Calculate position above footer tabs
  // Footer tabs height: 70 + bottom spacing: 15 + safe area bottom
  const footerHeight = 70 + tokens.spacing._15 + insets.bottom;
  const buttonBottom = footerHeight + 20; // 20px above footer

  return (
    <TouchableOpacity
      style={[styles.container, { bottom: buttonBottom }, style]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <View style={styles.iconContainer}>
        <Image
          source={require('@/assets/images/chat-icon.png')}
          style={styles.chatIcon}
          resizeMode="contain"
        />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: tokens.colors.text_primary,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 1000,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatIcon: {
    width: 50,
    height: 50,
  },
});

export default FloatingChatButton;
