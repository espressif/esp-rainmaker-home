/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { flattenStyle } from "@shared/utils/flattenStyle";
import { testProps } from "@shared/utils/testProps";

interface WifiNetworkSelectionProps {
  selectedWifi: string;
  placeholder: string;
  onPress: () => void;
  isLoading?: boolean;
}

/**
 * Web Wi-Fi network picker row with flattened touchable styles.
 * @param props - Selected SSID, placeholder copy, open handler, and loading flag.
 * @returns Tappable field that opens the available-networks sheet.
 */
export const WifiNetworkSelection: React.FC<WifiNetworkSelectionProps> = ({
  selectedWifi,
  placeholder,
  onPress,
  isLoading = false,
}) => (
  <TouchableOpacity
    style={flattenStyle([
      styles.input,
      { borderRadius: tokens.radius.md },
      globalStyles.shadowElevationForLightTheme,
    ])}
    {...testProps("button_select_network_wifi")}
    onPress={onPress}
    disabled={isLoading}
  >
    <Text
      style={
        selectedWifi ? globalStyles.settingsItemText : globalStyles.textGray
      }
      {...testProps("text_selected_wifi")}
    >
      {selectedWifi || placeholder}
    </Text>
    {isLoading ? (
      <View {...testProps("loading_select_network_wifi")}>
        <ActivityIndicator size="small" color={tokens.colors.gray} />
      </View>
    ) : (
      <ChevronDown size={20} color={tokens.colors.gray} />
    )}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  input: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 48,
    paddingHorizontal: tokens.spacing._15,
    backgroundColor: tokens.colors.white,
    borderWidth: 1,
    borderColor: tokens.colors.bg2,
  },
});
