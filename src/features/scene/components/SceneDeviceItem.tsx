/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, Pressable, StyleSheet } from "react-native";
import { X } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";
import { useTranslation } from "react-i18next";
import type { ESPCDFDevice, ESPCDFNode } from "@store";
import { DeviceAction } from "@shared/components";
import { getDeviceDisplayName } from "@shared/utils/deviceDisplayName";

type SceneDeviceItemProps = {
  node: ESPCDFNode;
  device: ESPCDFDevice;
  isSelected: boolean;
  isDisabled: boolean;
  isOnline: boolean;
  isMaxSceneReached: boolean;
  actions: Record<string, any>;
  onPress: () => void;
  onDelete: () => void;
  qaId?: string;
};

/**
 * SceneDeviceItem Component
 *
 * Reusable component for displaying a device in the device selection list
 * Used in scene device selection screens
 * @param node - The node containing the device
 * @param device - The device to display
 * @param isSelected - Whether the device is selected
 * @param isDisabled - Whether the device is disabled
 * @param isOnline - Whether the device is online
 * @param isMaxSceneReached - Whether max scenes are reached
 * @param actions - Actions/parameters for the device
 * @param onPress - Handler for device selection
 * @param onDelete - Handler for device deletion
 * @param qaId - Optional QA identifier for testing
 */
export default function SceneDeviceItem({
  node,
  device,
  isSelected,
  isDisabled,
  isOnline,
  isMaxSceneReached: _isMaxSceneReached,
  actions,
  onPress,
  onDelete,
  qaId,
}: SceneDeviceItemProps) {
  const { t } = useTranslation();

  return (
    <View
      {...testProps(qaId || "view_device_item")}
      style={[
        globalStyles.sceneDeviceSection,
        !isOnline && globalStyles.deviceCardDisabled,
        isDisabled && globalStyles.deviceCardDisabled,
      ]}
    >
      <DeviceAction
        qaId="device_action_item"
        device={device.type ?? ""}
        displayDeviceName={getDeviceDisplayName(device, node)}
        actions={isSelected ? actions : {}}
        onPress={() => !isDisabled && onPress()}
        rightSlot={
          isSelected && (
            <Pressable
              {...testProps("button_delete_selected_device")}
              style={styles.deleteButton}
              onPress={() => !isDisabled && onDelete()}
            >
              <X
                {...testProps("icon_delete_selected_device")}
                size={16}
                color={tokens.colors.red}
              />
            </Pressable>
          )
        }
        badgeLable={
          isDisabled &&
          (isOnline ? (
            <Text
              {...testProps("text_max_scene_reached")}
              style={[globalStyles.fontXs, globalStyles.textWarning]}
            >
              {t("scene.deviceSelection.maxSceneReached")}
            </Text>
          ) : (
            !isOnline && (
              <Text
                {...testProps("text_offline")}
                style={[globalStyles.fontXs, globalStyles.textGray]}
              >
                {t("layout.shared.offline")}
              </Text>
            )
          ))
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  deleteButton: {
    padding: tokens.spacing._10,
  },
});
