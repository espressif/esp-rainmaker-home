/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  View,
  ViewStyle,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

// Styles
import { globalStyles } from "@/theme/globalStyleSheet";

import { testProps } from "../../utils/testProps";
// Types
interface ScreenWrapperProps {
  /** Additional style overrides */
  style?: ViewStyle;
  /** Child components */
  children: React.ReactNode;
  /** Whether to dismiss keyboard on tap. Default: true */
  dismissKeyboard?: boolean;
  /** Whether to exclude top safe area (when Header is used separately). Default: false */
  excludeTop?: boolean;
  /** QA automation identifier */
  qaId?: string;
}

/**
 * ScreenWrapper
 *
 * A container component for wrapping screen content.
 * Features:
 * - Status bar configuration
 * - Consistent styling
 * - Style customization support
 * - Keyboard dismissal on tap outside input fields
 */
const ScreenWrapper: React.FC<ScreenWrapperProps> = ({
  style,
  children,
  dismissKeyboard = true,
  excludeTop = true,
  qaId,
}) => {
  const handleDismissKeyboard = () => {
    if (dismissKeyboard) {
      Keyboard.dismiss();
    }
  };

  const safeAreaEdges = excludeTop
    ? ["left", "right", "bottom"]
    : ["top", "left", "right", "bottom"];

  return (
    <SafeAreaView style={[globalStyles.container, style]} edges={safeAreaEdges}>
      <StatusBar style="dark" backgroundColor="#ffffff" translucent={false} />
      <TouchableWithoutFeedback {...(qaId ? testProps(qaId) : {})} onPress={handleDismissKeyboard}>
        <View style={{ flex: 1 }}>{children}</View>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
};

export default ScreenWrapper;
