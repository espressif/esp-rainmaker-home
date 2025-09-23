/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ViewStyle,
  TextStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Navigation
import { useRouter, usePathname, RelativePathString } from "expo-router";

// Styles
import { tokens } from "@/theme/tokens";

// Constants
import { PLATFORM_IOS } from "@/utils/constants";

// Types
interface Tab {
  /** Route to navigate to */
  route: RelativePathString;
  /** Tab label text */
  label: string;
  /** Icon component to display */
  Icon: React.ComponentType<any>;
}

interface FooterTabsProps {
  /** Array of tab configurations */
  tabs: Tab[];
}

/**
 * FooterTabs
 *
 * Navigation footer component that displays tabs for main app sections.
 * Features:
 * - Responsive tab layout
 * - Active tab highlighting
 * - Platform-specific styling
 * - Icon and label display
 */
const FooterTabs: React.FC<FooterTabsProps> = ({ tabs }) => {
  // Hooks
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  // Handlers
  const handleTabPress = (route: RelativePathString, label: string) => {
    // Don't navigate if already on the current route
    if (pathname.includes(label) || pathname === route) {
      return;
    }
    router.replace(route);
  };

  // Render helpers
  const renderTab = (tab: Tab) => {
    const isActive = pathname.includes(tab.label);
    const iconColor = isActive ? tokens.colors.primary : tokens.colors.gray;

    return (
      <TouchableOpacity
        key={tab.route}
        style={styles.item}
        onPress={() => handleTabPress(tab.route, tab.label)}
      >
        <tab.Icon style={{ color: iconColor }} size={28} />
        <Text style={[styles.label, { color: iconColor }]}>{tab.label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        styles.footerWrap,
        { bottom: tokens.spacing._15 + insets.bottom },
      ]}
    >
      {tabs.map(renderTab)}
    </View>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  footerWrap: {
    position: "absolute",
    left: tokens.spacing._10,
    right: tokens.spacing._10,
    bottom: tokens.spacing._15,
    height: 70,
    backgroundColor: tokens.colors.white,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    borderTopLeftRadius: tokens.radius.md,
    borderTopRightRadius: tokens.radius.md,
    borderBottomLeftRadius: Platform.OS === PLATFORM_IOS ? 30 : 20,
    borderBottomRightRadius: Platform.OS === PLATFORM_IOS ? 30 : 20,
    shadowColor: "#2c5aa0",
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1.5,
    borderColor: "rgba(44, 90, 160, 0.3)", // Steel blue border to match theme
  } as ViewStyle,
  item: {
    flex: 1,
    alignItems: "center",
  } as ViewStyle,
  label: {
    fontSize: tokens.fontSize.xxs,
    fontFamily: tokens.fonts.regular,
    marginTop: 0,
  } as TextStyle,
});

export default FooterTabs;
