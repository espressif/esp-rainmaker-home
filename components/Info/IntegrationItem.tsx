/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  Text,
  Pressable,
  Image,
  ImageSourcePropType,
  StyleSheet,
} from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

import { testProps } from "../../utils/testProps";
// Types
interface IntegrationItemProps {
  /** Icon source for the integration */
  icon: ImageSourcePropType;
  /** Title text */
  title: string;
  /** Press handler */
  onPress: () => void;
  /** QA automation identifier */
  qaId?: string;
}

/**
 * IntegrationItem
 *
 * A component for displaying integration options with icon and title.
 * Features:
 * - Icon display
 * - Title text
 * - Press interaction
 * - Consistent styling
 */
const IntegrationItem: React.FC<IntegrationItemProps> = ({
  icon,
  title,
  onPress,
  qaId,
}) => {
  return (
    <Pressable {...(qaId ? testProps(qaId) : {})}  style={styles.container} onPress={onPress}>
      <Image source={icon} style={styles.icon} resizeMode="contain" />
      <Text style={[globalStyles.fontRegular, styles.text]}>{title}</Text>
    </Pressable>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingHorizontal: tokens.spacing._20,
    paddingVertical: tokens.spacing._5,
  },
  icon: {
    width: 46,
    height: 46,
    marginBottom: tokens.spacing._5,
  },
  text: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.black,
    textAlign: "center",
  },
});

export default IntegrationItem;
