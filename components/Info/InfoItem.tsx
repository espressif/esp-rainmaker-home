/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

// Icons
import { ChevronRight } from 'lucide-react-native';

// Styles
import { tokens } from '@/theme/tokens';
import { globalStyles } from '@/theme/globalStyleSheet';

import { testProps } from "../../utils/testProps";
// Types
interface InfoItemProps {
  /** Label text to display */
  label: string;
  /** Optional value text to display */
  value?: string;
  /** Optional press handler */
  onPress?: () => void;
  /** Whether to show bottom separator */
  showSeparator?: boolean;
  /** QA automation identifier */
  qaId?: string;
}

/**
 * InfoItem
 * 
 * A component for displaying a label-value pair with optional interaction.
 * Features:
 * - Label and value display
 * - Optional press handler
 * - Optional bottom separator
 * - Right chevron for interactive items
 */
const InfoItem: React.FC<InfoItemProps> = ({
  label,
  value,
  onPress,
  showSeparator = true,
  qaId,
}) => {
  const Component = onPress ? Pressable : View;

  return (
    <>
      <Component 
        {...(qaId ? testProps(qaId) : {})}
        style={[
          globalStyles.flex,
          globalStyles.alignCenter,
          globalStyles.justifyBetween,
          styles.container
        ]} 
        onPress={onPress}
      >
        <Text {...testProps(`label_${qaId}`)} style={[globalStyles.fontRegular, styles.label]}>
          {label}
        </Text>
        <View style={[globalStyles.flex, globalStyles.alignCenter]}>
          <Text {...testProps(`text_${qaId}`)} style={[globalStyles.fontRegular, styles.value]}>
            {value}
          </Text>
          {onPress && (
            <ChevronRight {...(qaId ? testProps(`${qaId}_chevron`) : {})} size={16} color={tokens.colors.primary} />
          )}
        </View>
      </Component>
      
      {showSeparator && (
        <View style={globalStyles.settingsItemSeparator} />
      )}
    </>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  container: {
    paddingVertical: tokens.spacing._15,
    paddingHorizontal: tokens.spacing._5,
  },
  label: {
    fontSize: tokens.fontSize.md,
    color: tokens.colors.black,
  },
  value: {
    fontSize: tokens.fontSize.md,
    color: tokens.colors.bg3,
    marginRight: tokens.spacing._5,
  },
});

export default InfoItem; 