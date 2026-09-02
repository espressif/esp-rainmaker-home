/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { DeviceAction } from "@shared/components";
import type { ScheduleDeviceSelectionData } from "@src/types/global";
import { testProps } from "@shared/utils/testProps";

interface ScheduleDeviceItemProps {
  device: ScheduleDeviceSelectionData;
  deviceIndex: number;
  isDeviceDisabled: (device: ScheduleDeviceSelectionData) => boolean;
  getDeviceActionValues: (
    device: ScheduleDeviceSelectionData,
  ) => Record<string, any>;
  onDeviceSelect: (device: ScheduleDeviceSelectionData) => void;
  onDeviceDelete: (device: ScheduleDeviceSelectionData) => void;
  treatOfflineAsOnline?: boolean;
  qaId?: string;
}

/**
 * ScheduleDeviceItem Component
 *
 * Renders a single device item in the device selection list.
 */
export const ScheduleDeviceItem = ({
  device,
  deviceIndex,
  isDeviceDisabled,
  getDeviceActionValues,
  onDeviceSelect,
  onDeviceDelete,
  treatOfflineAsOnline = false,
  qaId,
}: ScheduleDeviceItemProps) => {
  const { t } = useTranslation();
  const isDeviceOnline = device.node.connectivityStatus?.isConnected || false;
  const showAsOnline = treatOfflineAsOnline || isDeviceOnline;
  const disabled = isDeviceDisabled(device);

  return (
    <View
      {...testProps(qaId || "view_device_item")}
      key={`${device.node.id}-${deviceIndex}`}
      style={[
        globalStyles.sceneDeviceSection,
        !showAsOnline && globalStyles.deviceCardDisabled,
        disabled && globalStyles.deviceCardDisabled,
      ]}
    >
      <DeviceAction
        device={device.device.type!}
        displayDeviceName={device.device.displayName!}
        actions={getDeviceActionValues(device)}
        onPress={() => !disabled && onDeviceSelect(device)}
        qaId={qaId || "device_action"}
        rightSlot={
          device.isSelected && (
            <Pressable
              style={globalStyles.scheduleDeviceItemDeleteButton}
              onPress={() => !disabled && onDeviceDelete(device)}
            >
              <X size={16} color={tokens.colors.red} />
            </Pressable>
          )
        }
        badgeLable={
          disabled &&
          (showAsOnline ? (
            <Text
              {...testProps("text_max_schedule_reached")}
              style={[globalStyles.fontXs, globalStyles.textWarning]}
            >
              {t("schedule.deviceSelection.maxScheduleReached")}
            </Text>
          ) : (
            !showAsOnline && (
              <Text style={[globalStyles.fontXs, globalStyles.textGray]}>
                {t("layout.shared.offline")}
              </Text>
            )
          ))
        }
      />
    </View>
  );
};
