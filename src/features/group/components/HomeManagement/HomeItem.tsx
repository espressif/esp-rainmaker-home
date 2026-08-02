/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";

export interface HomeItemProps {
  homeName: string;
  description: string;
  onPress: () => void;
}

/**
 * Single home row for Home Management list.
 * Displays name, description (device/room counts), and chevron.
 */
export const HomeItem: React.FC<HomeItemProps> = ({
  homeName,
  description,
  onPress
}) => (
  <TouchableOpacity
    style={[
      globalStyles.flex,
      globalStyles.justifyBetween,
      globalStyles.alignCenter,
      globalStyles.homeManagementHomeItem,
    ]}
    onPress={onPress}
    {...testProps(`button_${homeName}`)}
  >
    <View {...testProps(`view_home_name`)}>
      <Text
        {...testProps("text_name_home")}
        style={[globalStyles.fontRegular, globalStyles.fontMd]}
      >
        {homeName}
      </Text>
      <Text
        {...testProps("text_description_home")}
        style={[
          globalStyles.fontRegular,
          globalStyles.fontSm,
          globalStyles.textGray,
        ]}
      >
        {description}
      </Text>
    </View>
    <ChevronRight color={tokens.colors.primary} />
  </TouchableOpacity>
);
