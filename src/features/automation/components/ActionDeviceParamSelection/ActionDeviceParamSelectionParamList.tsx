/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, FlatList, Text } from "react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { ContentWrapper } from "@shared/components";
import { testProps } from "@shared/utils/testProps";
import type { ESPCDFDeviceParam } from "@store";

export interface ActionDeviceParamSelectionParamListProps {
  params: ESPCDFDeviceParam[];
  getParamDisplayValue: (param: ESPCDFDeviceParam) => string;
  onParamPress: (param: ESPCDFDeviceParam) => void;
}

/**
 * Renders the action device param selection param list UI section.
 */
export const ActionDeviceParamSelectionParamList: React.FC<
  ActionDeviceParamSelectionParamListProps
> = ({ params, getParamDisplayValue, onParamPress }) => {
  return (
    <View {...testProps("view_action_params_list")} style={{ flex: 1 }}>
      <FlatList
        {...testProps("list_action_params")}
        data={params}
        style={{ flex: 1 }}
        renderItem={({ item }: { item: ESPCDFDeviceParam }) => (
          <ContentWrapper
            qaId={`action_device_param_${item.name}_selection`}
            title={item.name}
            style={{
              marginBottom: tokens.spacing._10,
              paddingBottom: tokens.spacing._15,
              borderWidth: tokens.border.defaultWidth,
              borderColor: tokens.colors.borderColor,
            }}
            leftSlot={
              <Text
                {...testProps(`text_${item.name}_params_value`)}
                style={globalStyles.fontMedium}
              >
                {getParamDisplayValue(item)}
              </Text>
            }
            onPress={() => onParamPress(item)}
          />
        )}
        keyExtractor={(item) => item.name}
      />
    </View>
  );
};
