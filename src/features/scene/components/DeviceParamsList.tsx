/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, FlatList } from "react-native";
import type { ESPCDFDeviceParam } from "@store";
import { ContentWrapper } from "@shared/components";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";
import ParameterValueDisplay from "./ParameterValueDisplay";

interface DeviceParamsListProps {
  params: ESPCDFDeviceParam[];
  nodeId: string;
  deviceName: string;
  onParamSelect: (param: ESPCDFDeviceParam) => void;
  checkActionExists: (
    nodeId: string,
    deviceName: string,
    paramName: string,
  ) => { exist: boolean };
  getActionValue: (
    nodeId: string,
    deviceName: string,
    paramName: string,
  ) => any;
}

/**
 * DeviceParamsList Component
 *
 * Renders a list of device parameters with their configured values
 */
export default function DeviceParamsList({
  params,
  nodeId,
  deviceName,
  onParamSelect,
  checkActionExists,
  getActionValue,
}: DeviceParamsListProps) {
  const renderLeftSlot = (item: ESPCDFDeviceParam) => {
    if (!checkActionExists(nodeId, deviceName, item.name).exist) {
      return undefined;
    }
    return (
      <ParameterValueDisplay
        param={item}
        value={getActionValue(nodeId, deviceName, item.name)}
        qaId={`text_${item.name}_params_value`}
      />
    );
  };

  return (
    <View {...testProps("view_device_params_list")} style={globalStyles.flex1}>
      <FlatList
        {...testProps("list_device_params")}
        data={params}
        style={globalStyles.flex1}
        renderItem={({ item }) => (
          <ContentWrapper
            title={item.name}
            style={globalStyles.deviceParamsParamItem}
            leftSlot={renderLeftSlot(item)}
            onPress={() => onParamSelect(item)}
            qaId={`device_param_${item.name}_selection`}
          />
        )}
        keyExtractor={(item) => item.name}
      />
    </View>
  );
}
