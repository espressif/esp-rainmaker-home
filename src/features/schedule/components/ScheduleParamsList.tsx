/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, FlatList, Text } from "react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { ContentWrapper } from "@shared/components";
import { testProps } from "@shared/utils/testProps";
import type { ESPCDFDeviceParam } from "@store";

type ParamWithValue = ESPCDFDeviceParam & { value: any };

interface ScheduleParamsListProps {
  params: ParamWithValue[];
  renderParamValue: (param: ParamWithValue) => string;
  onParamSelect: (param: ParamWithValue) => void;
}

/**
 * ScheduleParamsList Component
 *
 * Displays a scrollable list of device parameters.
 */
export const ScheduleParamsList = ({
  params,
  renderParamValue,
  onParamSelect,
}: ScheduleParamsListProps) => {
  return (
    <View {...testProps("view_schedule_params_list")} style={{ flex: 1 }}>
      <FlatList
        {...testProps("list_schedule_params")}
        data={params}
        style={{ flex: 1 }}
        renderItem={({ item }) => (
          <ContentWrapper
            qaId={`schedule_device_param_${item.name}_selection`}
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
                {renderParamValue(item)}
              </Text>
            }
            onPress={() => {
              onParamSelect(item);
            }}
          />
        )}
        keyExtractor={(item) => item.name}
      />
    </View>
  );
};
