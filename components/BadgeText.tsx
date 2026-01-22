/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Text, type TextProps, type StyleProp, type TextStyle } from "react-native";
import { globalStyles } from "@/theme/globalStyleSheet";

export interface BadgeTextProps extends TextProps {
  style?: StyleProp<TextStyle>;
}

const BadgeText: React.FC<BadgeTextProps> = ({ children, style, ...rest }) => {
  return (
    <Text style={[globalStyles.badgeText, style]} {...rest}>
      {children}
    </Text>
  );
};

export default BadgeText;

