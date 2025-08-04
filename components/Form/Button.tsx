/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import React from "react";
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  GestureResponderEvent,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from "react-native";

// Styles
import { globalStyles } from "@/theme/globalStyleSheet";
import { tokens } from "@/theme/tokens";

// Types
interface ESPButtonProps {
  /** Button label text */
  label: string;
  /** Press event handler */
  onPress: (event: GestureResponderEvent) => void;
  /** Disable button interaction */
  disabled?: boolean;
  /** Show loading spinner */
  isLoading?: boolean;
  /** Optional child elements */
  children?: React.ReactNode;
  /** Additional button style overrides */
  style?: ViewStyle;
  /** Additional wrapper style overrides */
  wrapperStyle?: ViewStyle;
  /** Additional text style overrides */
  textStyle?: TextStyle;
}

/**
 * ESPButton
 * 
 * A reusable button component with loading state and customizable styles.
 * Features:
 * - Loading spinner
 * - Disabled state
 * - Custom styling options
 * - Optional child elements
 */
const ESPButton: React.FC<ESPButtonProps> = ({
  label,
  onPress,
  disabled = false,
  isLoading = false,
  children,
  style,
  wrapperStyle,
  textStyle,
}) => {
  return (
    <View style={[globalStyles.btnWrap, wrapperStyle]}>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || isLoading}
        style={[
          globalStyles.btn,
          styles.button,
          (disabled || isLoading) && globalStyles.btnDisabled,
          style,
        ]}
      >
        {isLoading ? (
          <ActivityIndicator color={tokens.colors.white} size="small" />
        ) : (
          <Text style={[styles.text, globalStyles.fontMd, textStyle]}>
            {label}
          </Text>
        )}
      </TouchableOpacity>

      {/* Children inside button container — slots like "error" and "custom" */}
      {children && <View style={styles.slotWrap}>{children}</View>}
    </View>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  button: {
    marginBottom: tokens.spacing._10,
    backgroundColor: tokens.colors.primary,
    borderRadius: 50
  },
  text: {
    color: tokens.colors.white,
    fontFamily: tokens.fonts.medium,
  },
  slotWrap: {
    marginTop: tokens.spacing._10,
    alignItems: "flex-end",
  },
});

export default ESPButton;
