/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text } from "react-native";
import * as Clipboard from "expo-clipboard";

// Styles
import { globalStyles } from "@/theme/globalStyleSheet";
import { tokens } from "@/theme/tokens";

// Icons
import { Copy } from "lucide-react-native";

import { testProps } from "../../utils/testProps";
// Types
interface InfoRowProps {
  /** Label text to display */
  label: string;
  /** Value text to display */
  value: string;
  /** Whether to show copy icon */
  isCopyable?: boolean;
  /** QA automation identifier */
  qaId?: string;
}

/**
 * InfoRow
 *
 * A simple component for displaying a label-value pair in a row format.
 * Features:
 * - Label and value display
 * - Consistent styling with global styles
 * - Colon separator between label and value
 */
const InfoRow: React.FC<InfoRowProps> = ({
  label,
  value,
  isCopyable = false,
  qaId,
}) => {
  const handleCopy = () => {
    Clipboard.setStringAsync(value);
  };
  return (
    <View {...(qaId ? testProps(qaId) : {})}  style={globalStyles.infoRow}>
      <Text style={globalStyles.infoLabel}>{label}:</Text>
      <View style={globalStyles.infoValue}>
        <Text>{value}</Text>
        {isCopyable && (
          <Copy size={20} color={tokens.colors.primary} onPress={handleCopy} />
        )}
      </View>
    </View>
  );
};

export default InfoRow;
