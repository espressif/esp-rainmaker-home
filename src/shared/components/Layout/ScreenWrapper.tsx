/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  View,
  ViewStyle,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

// Styles
import { globalStyles } from "@shared/theme/globalStyleSheet";

import { testProps } from "@shared/utils/testProps";
import { PLATFORM_WEB } from "@shared/utils/constants";

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
  /** Whether to exclude bottom safe area (when bottom inset is handled manually). Default: false */
  excludeBottom?: boolean;
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
 * - Keyboard dismissal on tap outside input fields (when dismissKeyboard is true)
 * - Optional exclusion of top/bottom safe areas when handled by a parent or child
 */
const ScreenWrapper: React.FC<ScreenWrapperProps> = ({
  style,
  children,
  dismissKeyboard = true,
  excludeTop = true,
  excludeBottom = false,
  qaId,
}) => {
  /**
   * Dismisses the software keyboard when the user taps outside an input.
   */
  const handleDismissKeyboard = () => {
    if (dismissKeyboard) {
      Keyboard.dismiss();
    }
  };

  const safeAreaEdges: Edge[] = [];
  if (!excludeTop) {
    safeAreaEdges.push("top");
  }
  safeAreaEdges.push("left", "right");
  if (!excludeBottom) {
    safeAreaEdges.push("bottom");
  }

  // Web: never wrap in TouchableWithoutFeedback — it fights TextInput focus.
  const useTapToDismiss =
    dismissKeyboard && Platform.OS !== PLATFORM_WEB;

  return (
    <SafeAreaView style={[globalStyles.container, style]} edges={safeAreaEdges}>
      <StatusBar style="dark" backgroundColor="#ffffff" translucent={false} />
      {useTapToDismiss ? (
        <TouchableWithoutFeedback
          {...(qaId ? testProps(qaId) : {})}
          accessible={false}
          onPress={handleDismissKeyboard}
        >
          <View style={{ flex: 1 }}>{children}</View>
        </TouchableWithoutFeedback>
      ) : (
        <View style={{ flex: 1 }} {...(qaId ? testProps(qaId) : {})}>
          {children}
        </View>
      )}
    </SafeAreaView>
  );
};

export default ScreenWrapper;
