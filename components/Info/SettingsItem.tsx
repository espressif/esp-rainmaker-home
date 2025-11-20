/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import React from "react";
import { View, Text, Pressable } from "react-native";

// Third Party Imports
import { ChevronRight } from "lucide-react-native";
import { Switch } from "tamagui";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Types
interface SettingsItemProps {
  /** Icon component to display */
  icon: React.ReactNode;
  /** Title text */
  title: string;
  /** Type of settings item */
  type?: "navigation" | "toggle";
  /** Callback when item is pressed */
  onPress?: () => void;
  /** Toggle state for toggle type */
  isToggled?: boolean;
  /** Callback when toggle changes */
  onToggle?: (value: boolean) => void;
  /** Whether to show bottom separator */
  showSeparator?: boolean;
}

/**
 * SettingsItem
 *
 * A component for displaying a settings menu item.
 * Features:
 * - Navigation or toggle functionality
 * - Icon and title display
 * - Optional separator line
 * - Customizable press behavior
 */
const SettingsItem: React.FC<SettingsItemProps> = ({
  icon,
  title,
  type = "navigation",
  onPress,
  isToggled = false,
  onToggle,
  showSeparator = true,
}) => {
  const renderRightElement = () => {
    if (type === "toggle") {
      return (
        <Switch size="$2.5" checked={isToggled} onCheckedChange={onToggle}>
          <Switch.Thumb
            animation="quicker"
            style={
              isToggled
                ? { backgroundColor: tokens.colors.blue }
                : { backgroundColor: tokens.colors.white }
            }
          />
        </Switch>
      );
    }

    return <ChevronRight size={20} color={tokens.colors.primary} />;
  };

  const ItemContent = () => (
    <>
      <View style={globalStyles.settingsItem}>
        <View style={globalStyles.settingsItemLeft}>
          <View style={globalStyles.settingsItemIcon}>{icon}</View>
          <Text style={globalStyles.settingsItemText}>{title}</Text>
        </View>
        {renderRightElement()}
      </View>
      {showSeparator && <View style={globalStyles.settingsItemSeparator} />}
    </>
  );

  if (type === "navigation" && onPress) {
    return (
      <Pressable onPress={onPress}>
        <ItemContent />
      </Pressable>
    );
  }

  return <ItemContent />;
};

export default SettingsItem;
