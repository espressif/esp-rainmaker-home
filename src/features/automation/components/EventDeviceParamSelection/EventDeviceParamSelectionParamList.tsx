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

export interface EventDeviceParamSelectionParamListProps {
  params: ESPCDFDeviceParam[];
  activeEventParam: string | null;
  getParamDisplayValue: (param: ESPCDFDeviceParam) => string;
  onParamPress: (param: ESPCDFDeviceParam) => void;
}

/**
 * Renders the event device param selection param list UI section.
 */
export const EventDeviceParamSelectionParamList: React.FC<
  EventDeviceParamSelectionParamListProps
> = ({ params, activeEventParam, getParamDisplayValue, onParamPress }) => {
  return (
    <View {...testProps("view_event_params_list")} style={{ flex: 1 }}>
      <FlatList
        {...testProps("list_event_params")}
        data={params}
        style={{ flex: 1 }}
        renderItem={({ item }: { item: ESPCDFDeviceParam }) => (
          <ContentWrapper
            qaId={`event_device_param_${item.name}_selection`}
            title={item.name}
            style={{
              marginBottom: tokens.spacing._10,
              paddingBottom: tokens.spacing._15,
              borderWidth: tokens.border.defaultWidth,
              borderColor:
                activeEventParam === item.name
                  ? tokens.colors.primary
                  : tokens.colors.borderColor,
              backgroundColor: tokens.colors.white,
            }}
            leftSlot={
              <Text
                {...testProps(`text_${item.name}_params_value`)}
                style={[
                  globalStyles.fontMedium,
                  activeEventParam === item.name && {
                    color: tokens.colors.primary,
                  },
                ]}
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
