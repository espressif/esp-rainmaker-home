/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { useWindowDimensions } from "react-native";
import * as Clipboard from "expo-clipboard";

// Styles
import { globalStyles } from "@/theme/globalStyleSheet";
import { tokens } from "@/theme/tokens";

// Icons
import { Copy } from "lucide-react-native";

import { testProps } from "../../utils/testProps";
// Hooks
import { useToast } from "@/hooks/useToast";

// Types
interface InfoRowProps {
  /** Label text to display */
  label: string;
  /** Value text to display */
  value: string;
  /** Whether to show copy icon */
  isCopyable?: boolean;
  /** Whether the value should be horizontally scrollable (default: false, true when isCopyable) */
  scrollable?: boolean;
  /** Whether the value should be right aligned (default: false) */
  rightAligned?: boolean;
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
 * - Optional copy functionality with toast notification
 */
const InfoRow: React.FC<InfoRowProps> = ({
  label,
  value,
  isCopyable = false,
  scrollable,
  rightAligned = false,
  qaId,
}) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { width } = useWindowDimensions();

  // If scrollable is not explicitly set, default to true when isCopyable
  const isScrollable = scrollable !== undefined ? scrollable : isCopyable;

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(value);
      toast.showSuccess(t("layout.shared.copiedToClipboard"));
    } catch (error) {
      console.error("Error copying to clipboard:", error);
      toast.showError(t("layout.shared.copyFailed"));
    }
  };

  // Calculate max width for scrollable values to prevent overflow
  // Account for label width (~120px), padding (~30px), copy icon (~30px), and margins
  const maxValueWidth = isScrollable
    ? width - 180 // Reserve space for label, padding, icon, and margins
    : undefined;

  return (
    <View {...(qaId ? testProps(qaId) : {})} style={globalStyles.infoRow}>
      <Text style={globalStyles.infoLabel}>{label}:</Text>
      <View
        style={[
          globalStyles.infoValue,
          isScrollable && { maxWidth: maxValueWidth, flex: 1, minWidth: 0 },
          rightAligned && { justifyContent: "flex-end" },
        ]}
      >
        {isScrollable ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={{
              alignItems: "center",
              paddingRight: tokens.spacing._5,
              ...(rightAligned && { flexGrow: 1, justifyContent: "flex-end" }),
            }}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
          >
            <TouchableOpacity activeOpacity={0.7}>
              <Text
                style={{
                  flexShrink: 0,
                  textAlign: rightAligned ? "right" : "left",
                }}
                selectable
              >
                {value}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <Text
            style={rightAligned ? { textAlign: "right", flex: 1 } : undefined}
          >
            {value}
          </Text>
        )}
        {isCopyable && (
          <TouchableOpacity
            onPress={handleCopy}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Copy size={20} color={tokens.colors.primary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default InfoRow;
