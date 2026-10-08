/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import React from "react";
import { View, Text, Pressable } from "react-native";

// Third Party Imports
import { ChevronRight } from "lucide-react-native";
import { Switch } from "tamagui";

// Styles
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { switchFrameProps } from "@shared/theme/switchFrameProps";

import { testProps } from "@shared/utils/testProps";
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
  /** QA automation identifier */
  qaId?: string;
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
  qaId,
}) => {
  const renderRightElement = () => {
    if (type === "toggle") {
      return (
        <Switch
          {...(qaId ? testProps(`${qaId}_toggle`) : {})}
          {...switchFrameProps}
          size="$2.5"
          checked={isToggled}
          onCheckedChange={onToggle}
          style={globalStyles.switch}
        >
          <Switch.Thumb
            animation="quicker"
            style={
              isToggled
                ? globalStyles.switchThumbActive
                : globalStyles.switchThumb
            }
          />
        </Switch>
      );
    }

    return <ChevronRight {...(qaId ? testProps(`${qaId}_chevron`) : {})} size={20} color={tokens.colors.primary} />;
  };

  const ItemContent = () => (
    <>
      <View
        style={globalStyles.settingsItem}
        {...(qaId ? testProps(`view_${qaId}`) : {})}
      >
        <View style={globalStyles.settingsItemLeft}>
          <View style={globalStyles.settingsItemIcon}>{icon}</View>
          <Text {...(qaId ? testProps(`text_${qaId}`) : {})} style={globalStyles.settingsItemText}>{title}</Text>
        </View>
        {renderRightElement()}
      </View>
      {showSeparator && <View style={globalStyles.settingsItemSeparator} />}
    </>
  );

  if (type === "navigation" && onPress) {
    return (
      <Pressable {...(qaId ? testProps(`button_${qaId}`) : {})}  onPress={onPress}>
        <ItemContent />
      </Pressable>
    );
  }

  return <ItemContent />;
};

export default SettingsItem;
