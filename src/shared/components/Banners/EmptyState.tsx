/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";

// Icons
import { Search } from "lucide-react-native";

// Styles
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";

import { testProps } from "@shared/utils/testProps";
// Types
interface EmptyStateProps {
  /** Custom icon element */
  icon?: React.ReactNode;
  /** Message to display */
  message?: string;
  /** QA automation identifier */
  qaId?: string;
}

/**
 * EmptyState
 *
 * A component to display when there is no content to show.
 * Features:
 * - Customizable icon
 * - Custom message text
 * - Consistent styling with global theme
 */
const EmptyState: React.FC<EmptyStateProps> = ({
  icon = <Search size={60} color={tokens.colors.bg2} />,
  message = "No Data",
  qaId,
}) => {
  return (
    <View
      {...(qaId ? testProps(qaId) : {})}
      style={[
        globalStyles.flex1,
        globalStyles.justifyCenter,
        globalStyles.alignCenter,
        styles.container,
      ]}
    >
      {icon}
      <Text style={[globalStyles.fontRegular, styles.text]}>{message}</Text>
    </View>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  container: {
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.md,
    margin: tokens.spacing._15,
    // Fill the parent minus the margins; a hard width of 100% ignores the
    // horizontal margin and shifts the card off-center.
    alignSelf: 'stretch',
  },
  text: {
    fontSize: tokens.fontSize.md,
    color: tokens.colors.bg3,
    marginTop: tokens.spacing._15,
    textAlign: 'center',
  },
});

export default EmptyState;
