/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Text, TextStyle, TextProps } from "react-native";

// Utils
import { verticalScale } from "@/utils/styling";

// Styles
import { tokens } from "@/theme/tokens";

import { testProps } from "../../utils/testProps";
// Types
interface TypoProps extends TextProps {
  /** Font size in pixels */
  size?: number;
  /** Text color */
  color?: string;
  /** Font weight */
  fontWeight?: TextStyle["fontWeight"];
  /** Child content */
  children: React.ReactNode;
  /** Additional style overrides */
  style?: TextStyle;
  /** Additional text props */
  textProps?: TextProps;
  /** Press handler */
  onPress?: () => void;
  /** Typography variant */
  variant?: keyof typeof variantStyles;
  /** Bold text */
  bold?: boolean;
  /** Add double line break after text */
  addNewLine?: boolean;
  /** QA automation identifier */
  qaId?: string;
}

// Variant Styles
const variantStyles = {
  h1: {
    fontSize: verticalScale(tokens.fontSize.xl),
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.black,
  },
  h2: {
    fontSize: verticalScale(tokens.fontSize.lg),
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.black,
  },
  h3: {
    fontSize: verticalScale(tokens.fontSize.md),
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.black,
  },
  subtitle: {
    fontSize: verticalScale(tokens.fontSize.sm),
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_primary,
  },
  body: {
    fontSize: verticalScale(tokens.fontSize._15),
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_primary,
  },
  small: {
    fontSize: verticalScale(tokens.fontSize.xs),
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_primary,
  },
} as const;

/**
 * Typo
 *
 * A typography component for consistent text styling.
 * Features:
 * - Multiple variants (h1, h2, h3, subtitle, body, small)
 * - Custom size and color support
 * - Font weight control
 * - Style customization
 * - Optional line breaks
 */
const Typo: React.FC<TypoProps> = ({
  size,
  color,
  fontWeight,
  children,
  style,
  textProps = {},
  onPress,
  variant = "body",
  bold,
  addNewLine = false,
  qaId}) => {
  const baseStyle = variantStyles[variant];

  const textStyle: TextStyle = {
    ...baseStyle,
    fontSize: size ? verticalScale(size) : baseStyle.fontSize,
    color: color || baseStyle.color,
    fontWeight: bold ? "bold" : fontWeight || undefined,
    fontFamily: tokens.fonts.regular,
  };

  return (
    <Text {...(qaId ? testProps(qaId) : {})}  style={[textStyle, style]} {...textProps} onPress={onPress}>
      {children}
      {addNewLine && "\n\n"}
    </Text>
  );
};

export default Typo;
