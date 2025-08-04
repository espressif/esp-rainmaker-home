/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import React from "react";
import { Pressable } from "react-native";

// Styles
import { globalStyles } from "@/theme/globalStyleSheet";

// Types
interface ActionButtonProps {
  /** Children elements to render */
  children: React.ReactNode;
  /** Callback when button is pressed */
  onPress: () => void;
  /** Disable button interaction */
  disabled?: boolean;
  /** Button variant style */
  variant?: "primary" | "secondary" | "danger";
  /** Additional style overrides */
  style?: any;
}

/**
 * ActionButton
 * 
 * A reusable button component with different style variants.
 * Supports primary, secondary, and danger variants with consistent styling.
 */
const ActionButton: React.FC<ActionButtonProps> = ({ 
  children, 
  onPress, 
  disabled = false, 
  variant = "primary",
  style = {}
}) => (
  <Pressable
    style={[
      globalStyles.button,
      variant === "primary" && globalStyles.buttonPrimary,
      variant === "secondary" && globalStyles.buttonSecondary,
      variant === "danger" && globalStyles.buttonDanger,
      disabled && globalStyles.btnDisabled,
      style
    ]}
    onPress={onPress}
    disabled={disabled}
  >
    {children}
  </Pressable>
);

export default ActionButton; 