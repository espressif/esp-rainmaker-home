/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, StyleSheet, Platform } from "react-native";

// Third Party Imports
import { Toast, useToastState } from "@tamagui/toast";
import { Text } from "tamagui";
import { Check, AlertTriangle, Info, X } from "lucide-react-native";

// Styles
import { tokens } from "@/theme/tokens";

// Constants
import {
  TOAST_TYPE_ERROR,
  TOAST_TYPE_SUCCESS,
  TOAST_TYPE_WARNING,
} from "@/utils/constants";

// Types
interface ToastCustomData {
  type?: "success" | "error" | "warning" | "info";
}

/**
 * ToastContainer
 *
 * A component for displaying toast notifications.
 * Features:
 * - Multiple toast types (success, error, warning)
 * - Animated entrance/exit
 * - Custom styling per type
 * - Platform-specific adjustments
 */
export const ToastContainer: React.FC = () => {
  const currentToast = useToastState();

  if (!currentToast || currentToast.isHandledNatively) return null;

  const customData = currentToast.customData as ToastCustomData | undefined;
  const type = customData?.type || TOAST_TYPE_SUCCESS;

  // Get theme-aware colors and styles based on toast type
  const getToastTheme = () => {
    switch (type) {
      case TOAST_TYPE_SUCCESS:
        return {
          iconColor: tokens.colors.green,
          backgroundColor: tokens.colors.white,
          borderColor: tokens.colors.green,
          titleColor: tokens.colors.text_primary,
          messageColor: tokens.colors.text_secondary,
          shadowColor: tokens.colors.green,
        };
      case TOAST_TYPE_ERROR:
        return {
          iconColor: tokens.colors.red,
          backgroundColor: tokens.colors.white,
          borderColor: tokens.colors.red,
          titleColor: tokens.colors.text_primary,
          messageColor: tokens.colors.text_secondary,
          shadowColor: tokens.colors.red,
        };
      case TOAST_TYPE_WARNING:
        return {
          iconColor: tokens.colors.orange,
          backgroundColor: tokens.colors.white,
          borderColor: tokens.colors.orange,
          titleColor: tokens.colors.text_primary,
          messageColor: tokens.colors.text_secondary,
          shadowColor: tokens.colors.orange,
        };
      case "info":
        return {
          iconColor: tokens.colors.primary,
          backgroundColor: tokens.colors.white,
          borderColor: tokens.colors.primary,
          titleColor: tokens.colors.text_primary,
          messageColor: tokens.colors.text_secondary,
          shadowColor: tokens.colors.primary,
        };
      default:
        return {
          iconColor: tokens.colors.primary,
          backgroundColor: tokens.colors.white,
          borderColor: tokens.colors.primary,
          titleColor: tokens.colors.text_primary,
          messageColor: tokens.colors.text_secondary,
          shadowColor: tokens.colors.primary,
        };
    }
  };

  const toastTheme = getToastTheme();

  // Enhanced animations and positioning
  const getToastPosition = () => {
    return {
      enterStyle: {
        opacity: 0,
        scale: 0.95,
        y: -30,
        x: 0,
      },
      exitStyle: {
        opacity: 0,
        scale: 0.95,
        y: -30,
        x: 0,
      },
      y: Platform.OS === "ios" ? 60 : 20, // Better positioning for different platforms
    };
  };

  const position = getToastPosition();

  return (
    <Toast
      animation="quick"
      key={currentToast.id}
      duration={currentToast.duration}
      enterStyle={position.enterStyle}
      exitStyle={position.exitStyle}
      opacity={1}
      scale={1}
      y={position.y}
      viewportName={currentToast.viewportName}
      backgroundColor={toastTheme.backgroundColor}
      borderRadius={tokens.radius.md}
      borderWidth={2}
      borderColor={toastTheme.borderColor}
      paddingHorizontal={tokens.spacing._20}
      paddingVertical={tokens.spacing._15}
      style={[
        styles.toast,
        {
          shadowColor: toastTheme.shadowColor,
        },
      ]}
    >
      <View style={styles.container}>
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: toastTheme.iconColor },
          ]}
        >
          {type === "success" ? (
            <Check color={tokens.colors.white} size={20} />
          ) : type === "warning" ? (
            <AlertTriangle color={tokens.colors.white} size={20} />
          ) : type === "info" ? (
            <Info color={tokens.colors.white} size={20} />
          ) : (
            <X color={tokens.colors.white} size={20} />
          )}
        </View>
        <View style={styles.content}>
          <Text
            color={toastTheme.titleColor}
            fontWeight="600"
            fontSize={tokens.fontSize.md}
            style={styles.title}
          >
            {currentToast.title}
          </Text>
          {!!currentToast.message && (
            <Text
              color={toastTheme.messageColor}
              fontSize={tokens.fontSize.sm}
              style={styles.message}
            >
              {currentToast.message}
            </Text>
          )}
        </View>
      </View>
    </Toast>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  toast: {
    zIndex: 10000,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    marginHorizontal: tokens.spacing._15,
  },
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: tokens.spacing._15,
    marginTop: 2, // Slight alignment adjustment
  },
  content: {
    flex: 1,
    paddingTop: 2,
  },
  title: {
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  message: {
    marginTop: 4,
    lineHeight: 20,
    opacity: 0.8,
    letterSpacing: -0.1,
    flexWrap: "wrap",
  },
});

export default ToastContainer;
