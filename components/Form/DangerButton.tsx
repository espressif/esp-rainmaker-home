/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';

// Styles
import { tokens } from '@/theme/tokens';
import { globalStyles } from '@/theme/globalStyleSheet';

// Types
interface DangerButtonProps {
  /** Icon element to display */
  icon: React.ReactNode;
  /** Button text */
  title: string;
  /** Press event handler */
  onPress: () => void;
}

/**
 * DangerButton
 * 
 * A button component for dangerous or destructive actions.
 * Features:
 * - Icon + text layout
 * - Red color scheme
 * - Consistent styling with global theme
 */
const DangerButton: React.FC<DangerButtonProps> = ({
  icon,
  title,
  onPress,
}) => {
  return (
    <Pressable 
      style={[
        globalStyles.settingsSection,
        globalStyles.flex,
        globalStyles.alignCenter,
        globalStyles.justifyCenter,
        styles.container
      ]} 
      onPress={onPress}
    >
      {icon}
      <Text style={[globalStyles.fontMedium, styles.text]}>
        {title}
      </Text>
    </Pressable>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  container: {
    paddingVertical: tokens.spacing._15,
    paddingHorizontal: tokens.spacing._15,
    backgroundColor: tokens.colors.white,
    ...globalStyles.shadowElevationForLightTheme,
  },
  text: {
    fontSize: tokens.fontSize.md,
    color: tokens.colors.red,
    marginLeft: tokens.spacing._10,
  },
});

export default DangerButton; 