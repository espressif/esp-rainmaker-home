/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View } from "react-native";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { DeviceAction } from "@shared/components";
import type { DeviceSelectionData } from "@src/types/global";
import type { CreateAutomationEventInfo } from "@features/automation/utils/automationManagement";
import {testProps} from "@shared/utils/testProps";

export interface EventDeviceSelectionDeviceItemProps {
  device: DeviceSelectionData;
  currentEventInfo: CreateAutomationEventInfo | null;
  isCurrentEventDevice: boolean;
  isDisabled?: boolean;
  onPress: () => void;
}

/**
 * Renders the event device selection device item UI section.
 */
export const EventDeviceSelectionDeviceItem: React.FC<
  EventDeviceSelectionDeviceItemProps
> = ({
  device,
  currentEventInfo,
  isCurrentEventDevice,
  isDisabled = false,
  onPress,
}) => {
  const eventConditions =
    isCurrentEventDevice && currentEventInfo
      ? {
          [currentEventInfo.parameter]: {
            condition: currentEventInfo.condition,
            value: currentEventInfo.value,
          },
        }
      : undefined;

  return (
    <View
      {...testProps("view_event_device_selection")}
      style={[
        globalStyles.sceneDeviceSection,
        isDisabled && globalStyles.deviceCardDisabled,
      ]}
    >
      <DeviceAction
        qaId="event_device_selection_item"
        device={device.device.type ?? ""}
        displayDeviceName={device.device.displayName ?? ""}
        actions={{}}
        onPress={() => !isDisabled && onPress()}
        eventConditions={eventConditions}
        isEventMode={!!isCurrentEventDevice}
      />
    </View>
  );
};
