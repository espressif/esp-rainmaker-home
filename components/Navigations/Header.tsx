/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Navigation
import { useRouter } from "expo-router";

// Icons
import { Ionicons } from "@expo/vector-icons";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Constants
import { PLATFORM_IOS } from "@/utils/constants";

// Types
interface HeaderProps {
  /** Header title text */
  label: string;
  /** Whether to show back button */
  showBack?: boolean;
  /** Custom back navigation URL */
  customBackUrl?: string;
  /** Optional element to render in right side */
  rightSlot?: React.ReactNode;
  /** Header background color */
  backgroundColor?: string;
  /** Custom back press handler */
  onBackPress?: () => void;
}

/**
 * Header
 *
 * App header component with navigation and customization options.
 * Features:
 * - Back button navigation
 * - Custom back URL support
 * - Right side slot for custom content
 * - Platform-specific styling
 * - Custom background color
 */
const Header: React.FC<HeaderProps> = ({
  label = "",
  showBack = true,
  customBackUrl,
  rightSlot,
  backgroundColor = tokens.colors.white,
  onBackPress,
}) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = Dimensions.get("window");

  // Platform-specific padding: Keep iOS logic intact, use SafeAreaInsets for Android
  const paddingTop =
    Platform.OS === PLATFORM_IOS
      ? height * 0.06 // Keep existing iOS logic
      : insets.top + 10; // Use SafeAreaInsets for Android

  const goBack = () => {
    if (customBackUrl) {
      router.replace(customBackUrl as any);
    } else {
      router.back();
    }
    onBackPress?.();
  };

  return (
    <View style={[styles.headerWrap, { paddingTop, backgroundColor }]}>
      <View style={styles.contentContainer}>
        {showBack && (
          <Pressable onPress={goBack} style={styles.backIcon}>
            <Ionicons name="chevron-back" size={24} color={tokens.colors.bg3} />
          </Pressable>
        )}

        <Text
          style={[
            globalStyles.fontMedium,
            globalStyles.fontMd,
            globalStyles.ellipsis,
            styles.title,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>

        <View style={styles.rightSlot}>{rightSlot}</View>
      </View>
    </View>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  headerWrap: {
    width: "100%",
    borderBottomWidth: 1,
    borderColor: tokens.colors.borderColor,
    position: "relative",
    zIndex: 10,
    paddingHorizontal: tokens.spacing._15,
    paddingBottom: tokens.spacing._10,
    justifyContent: "flex-end",
    flexDirection: "column",
  },
  contentContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  backIcon: {
    position: "absolute",
    left: 0,
    padding: 0,
    zIndex: 1,
  },
  title: {
    flex: 1,
    textAlign: "center",
    paddingHorizontal: tokens.spacing._40,
    fontFamily: tokens.fonts.medium,
    fontWeight: "bold",
  },
  rightSlot: {
    position: "absolute",
    right: 0,
  },
});

export default Header;
