/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { Dimensions, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Third Party Imports
import { useToastController, useToastState } from "@tamagui/toast";
import { Text } from "tamagui";
import { Check, AlertTriangle, Info, X } from "lucide-react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

// Styles
import { tokens } from "@shared/theme/tokens";

// Constants / layout
import {
  TOAST_EDGE_PADDING,
  TOAST_SWIPE_DISMISS_THRESHOLD,
  TOAST_TYPE_ERROR,
  TOAST_TYPE_INFO,
  TOAST_TYPE_SUCCESS,
  TOAST_TYPE_WARNING,
} from "@shared/utils/constants";
import { getToastTopOffset } from "@shared/utils/headerLayout";

import { testProps } from "@shared/utils/testProps";

interface ToastCustomData {
  type?: "success" | "error" | "warning" | "info";
}

/**
 * Maps toast type to accent + text colors (brand colors unchanged).
 * @param type - Toast variant key
 * @returns Theme colors for that variant
 */
const getToastTheme = (type: string) => {
  const accentByType: Record<string, string> = {
    [TOAST_TYPE_SUCCESS]: tokens.colors.green,
    [TOAST_TYPE_ERROR]: tokens.colors.red,
    [TOAST_TYPE_WARNING]: tokens.colors.orange,
    [TOAST_TYPE_INFO]: tokens.colors.primary,
  };

  return {
    accentColor: accentByType[type] ?? tokens.colors.primary,
    backgroundColor: tokens.colors.white,
    titleColor: tokens.colors.text_primary,
    messageColor: tokens.colors.text_secondary,
  };
};

/**
 * Returns the status icon for a toast type.
 * @param type - Toast variant key
 * @param color - Icon stroke color
 * @returns Lucide icon element
 */
const ToastIcon = ({ type, color }: { type: string; color: string }) => {
  const props = { color, size: 18, strokeWidth: 2.5 } as const;
  if (type === TOAST_TYPE_SUCCESS) return <Check {...props} />;
  if (type === TOAST_TYPE_WARNING) return <AlertTriangle {...props} />;
  if (type === TOAST_TYPE_INFO) return <Info {...props} />;
  return <X {...props} />;
};

/**
 * Custom toast overlay driven by Tamagui's imperative state only.
 *
 * Does not render Tamagui `<Toast>` — that component's pan responder snaps the
 * card back on release (adjust → then dismiss). We own swipe + unmount so a
 * dismiss gesture leaves the card where it is and removes it immediately.
 */
export const ToastContainer: React.FC = () => {
  const currentToast = useToastState();
  const { hide } = useToastController();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = Dimensions.get("window");
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const toastIdRef = useRef<string | null>(null);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const toastId = currentToast?.id ?? null;
  toastIdRef.current = toastId;

  const isVisible =
    !!currentToast &&
    !currentToast.isHandledNatively &&
    currentToast.hide !== true &&
    dismissedId !== toastId;

  useEffect(() => {
    translateX.value = 0;
    translateY.value = 0;
  }, [toastId, translateX, translateY]);

  // Duration auto-dismiss (previously owned by Tamagui <Toast>).
  useEffect(() => {
    if (!isVisible || !toastId || !currentToast) return;
    const duration = currentToast.duration;
    if (!duration || duration <= 0) return;

    const timer = setTimeout(() => {
      setDismissedId(toastId);
      hide();
    }, duration);

    return () => clearTimeout(timer);
  }, [toastId, isVisible, currentToast, hide]);

  /**
   * Marks this toast id dismissed locally, then clears Tamagui state.
   * Local flag unmounts before Tamagui's delayed null so there is no snap-back frame.
   */
  const dismissToast = () => {
    const id = toastIdRef.current;
    if (id) {
      setDismissedId(id);
    }
    hide();
  };

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = Math.min(0, e.translationY);
    })
    .onEnd((e) => {
      const shouldDismiss =
        Math.abs(e.translationX) > TOAST_SWIPE_DISMISS_THRESHOLD ||
        e.translationY < -TOAST_SWIPE_DISMISS_THRESHOLD;

      if (shouldDismiss) {
        // Do not spring back — leave offset and unmount immediately.
        runOnJS(dismissToast)();
        return;
      }

      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    });

  const swipeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  if (!isVisible || !currentToast) {
    return null;
  }

  const customData = currentToast.customData as ToastCustomData | undefined;
  const type = customData?.type || TOAST_TYPE_SUCCESS;
  const theme = getToastTheme(type);
  const hasMessage = !!currentToast.message;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.overlay,
        {
          // inset/header-top + header content
          paddingTop: getToastTopOffset(insets.top, windowHeight),
          paddingHorizontal: TOAST_EDGE_PADDING,
        },
      ]}
    >
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.toastBody,
            {
              backgroundColor: theme.backgroundColor,
              borderColor: theme.accentColor,
            },
            swipeStyle,
          ]}
        >
          <View
            style={[
              styles.container,
              hasMessage ? styles.alignStart : styles.alignCenter,
            ]}
          >
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: `${theme.accentColor}1A` },
              ]}
            >
              <ToastIcon type={type} color={theme.accentColor} />
            </View>
            <View style={styles.content}>
              <Text
                color={theme.titleColor}
                fontSize={tokens.fontSize.md}
                style={styles.title}
                {...testProps("toast_title")}
              >
                {currentToast.title}
              </Text>
              {hasMessage && (
                <Text
                  color={theme.messageColor}
                  fontSize={tokens.fontSize.sm}
                  style={styles.message}
                  {...testProps("toast_message")}
                >
                  {currentToast.message}
                </Text>
              )}
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    elevation: 10000,
  },
  toastBody: {
    width: "100%",
    borderRadius: tokens.radius.md,
    borderWidth: tokens.border.defaultWidth,
    paddingHorizontal: tokens.spacing._15,
    paddingVertical: tokens.spacing._15,
  },
  container: {
    flexDirection: "row",
    width: "100%",
  },
  alignStart: {
    alignItems: "flex-start",
  },
  alignCenter: {
    alignItems: "center",
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: tokens.spacing._10,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: tokens.fonts.medium,
    lineHeight: 22,
  },
  message: {
    fontFamily: tokens.fonts.regular,
    marginTop: 2,
    lineHeight: 20,
    flexWrap: "wrap",
  },
});

export default ToastContainer;
