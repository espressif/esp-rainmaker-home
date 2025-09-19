/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import React from 'react';
import { Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';

// Icons
import { LogOut } from 'lucide-react-native';

// Styles
import { tokens } from '@/theme/tokens';
import { globalStyles } from '@/theme/globalStyleSheet';

// Types
interface LogoutButtonProps {
  /** Press handler */
  onPress: () => void;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * LogoutButton
 * 
 * A button component for handling user logout.
 * Features:
 * - Loading state indicator
 * - Consistent styling
 * - Icon and text display
 * - Press interaction
 */
const LogoutButton: React.FC<LogoutButtonProps> = ({
  onPress,
  isLoading = false,
}) => {
  return (
    <Pressable 
      style={[globalStyles.settingsSection, styles.container]} 
      onPress={onPress} 
      disabled={isLoading}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={tokens.colors.red} />
      ) : (
        <>
          <LogOut size={20} color={tokens.colors.red} />
          <Text style={[globalStyles.fontMedium, styles.text]}>
            Log Out
          </Text>
        </>
      )}
    </Pressable>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: tokens.spacing._15,
    paddingHorizontal: tokens.spacing._15,
  },
  text: {
    fontSize: tokens.fontSize.md,
    color: tokens.colors.red,
    marginLeft: tokens.spacing._10,
  },
});

export default LogoutButton; 