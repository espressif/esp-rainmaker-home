/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Icons
import { ChevronRight } from "lucide-react-native";

// Types
interface UserOperationItemProps {
  /** Icon to display on the left */
  icon: React.ReactNode;
  /** Title text */
  title: string;
  /** Callback when item is pressed */
  onPress: () => void;
  /** Show red badge dot */
  showBadge?: boolean;
  /** Highlight item text (debug mode) */
  isDebug?: boolean;
  /** Show bottom separator */
  showSeparator?: boolean;
}

/**
 * UserOperationItem
 *
 * Single row item in user settings list with optional badge and debug styling.
 * Utilizes global reusable styles for consistent layout.
 */
const UserOperationItem: React.FC<UserOperationItemProps> = ({
  icon,
  title,
  onPress,
  showBadge = false,
  isDebug = false,
  showSeparator = true,
}) => (
  <>
    <Pressable style={globalStyles.settingsItem} onPress={onPress}>
      {/* Left Section */}
      <View style={globalStyles.settingsItemLeft}>
        <View style={globalStyles.settingsItemIcon}>{icon}</View>
        <Text
          style={[globalStyles.settingsItemText, isDebug && styles.debugText]}
        >
          {title}
        </Text>
      </View>

      {/* Right Section */}
      <View style={[globalStyles.flex, globalStyles.alignCenter]}>
        {showBadge && <View style={styles.badge} />}
        <ChevronRight
          size={20}
          color={isDebug ? tokens.colors.blue : tokens.colors.primary}
        />
      </View>
    </Pressable>

    {showSeparator && <View style={globalStyles.settingsItemSeparator} />}
  </>
);

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  debugText: {
    color: tokens.colors.blue,
    fontFamily: tokens.fonts.medium,
  },
  badge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.colors.red,
    marginRight: tokens.spacing._10,
  },
});

export default UserOperationItem; 