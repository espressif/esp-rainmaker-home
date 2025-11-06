/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, StyleSheet, Text, ScrollView, Pressable } from "react-native";

// Styles
import { tokens } from "@/theme/tokens";

import { testProps } from "../../utils/testProps";
// Types
interface ContentWrapperProps {
  children?: React.ReactNode;
  leftSlot?: React.ReactNode;
  title?: string;
  style?: any;
  contentStyle?: any;
  scrollContent?: boolean;
  onPress?: () => void;
  /** QA automation identifier */
  qaId?: string;
}

/**
 * ContentWrapper
 *
 * A component for wrapping content with optional header and scrollable content.
 * Features:
 * - Optional header with title and left slot
 * - Optional scrollable content
 * - Consistent styling
 */
const ContentWrapper: React.FC<ContentWrapperProps> = ({
  children,
  leftSlot,
  title,
  style,
  contentStyle,
  scrollContent,
  onPress,
  qaId,
}) => {
  return (
    <Pressable {...(qaId ? testProps(`button_${qaId}`) : {})}  style={[styles.container, style]} onPress={onPress}>
      {title && (
        <View style={styles.header}>
          <Text {...(qaId ? testProps(`text_title_${qaId}`) : {})} style={styles.title}>{title}</Text>
          {leftSlot}
        </View>
      )}
      {children && title && <View style={styles.divider} />}
      {scrollContent ? (
        <ScrollView
          style={[styles.content, !title && styles.contentNoHeader, style]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.content,
            !title && styles.contentNoHeader,
            contentStyle,
          ]}
        >
          {children}
        </View>
      )}
    </Pressable>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  container: {
    padding: tokens.spacing._15,
    paddingBottom: 0,
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.sm,
    overflow: "hidden",
  },
  content: {},
  contentNoHeader: {
    marginTop: -tokens.spacing._15,
    paddingTop: 0,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    flex: 1,
    fontWeight: 500,
    fontFamily: tokens.fonts.medium,
  },
  divider: {
    height: 1,
    backgroundColor: tokens.colors.borderColor,
    marginVertical: 10,
  },
});

export default ContentWrapper;
