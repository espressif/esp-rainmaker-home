/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Pressable } from "react-native";
import { X } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { DeviceAction } from "@shared/components";
import { testProps } from "@shared/utils/testProps";
import type { DeviceSelectionData } from "@src/types/global";
import { getDeviceDisplayName } from "@shared/utils/deviceDisplayName";

export interface ActionDeviceSelectionDeviceItemProps {
  device: DeviceSelectionData;
  actions: Record<string, unknown>;
  isDisabled?: boolean;
  onPress: () => void;
  onDelete: () => void;
  showDelete: boolean;
}

/**
 * Renders the action device selection device item UI section.
 */
export const ActionDeviceSelectionDeviceItem: React.FC<
  ActionDeviceSelectionDeviceItemProps
> = ({
  device,
  actions,
  isDisabled = false,
  onPress,
  onDelete,
  showDelete,
}) => {
  return (
    <View
      {...testProps("view_action_device_item")}
      style={[
        globalStyles.sceneDeviceSection,
        isDisabled && globalStyles.deviceCardDisabled,
      ]}
    >
      <DeviceAction
        qaId="action_device_action_item"
        device={device.device.type ?? ""}
        displayDeviceName={getDeviceDisplayName(device.device, device.node)}
        actions={actions as Record<string, any>}
        onPress={() => !isDisabled && onPress()}
        rightSlot={
          showDelete ? (
            <Pressable
              {...testProps("button_delete_selected_action_device")}
              style={{ padding: tokens.spacing._10 }}
              onPress={() => !isDisabled && onDelete()}
            >
              <X
                {...testProps("icon_delete_selected_action_device")}
                size={16}
                color={tokens.colors.red}
              />
            </Pressable>
          ) : undefined
        }
      />
    </View>
  );
};
