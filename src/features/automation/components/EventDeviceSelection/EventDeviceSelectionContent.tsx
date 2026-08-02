/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, ScrollView } from "react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";
import type { DeviceSelectionData } from "@src/types/global";

export interface EventDeviceSelectionContentProps {
  selectedDevices: DeviceSelectionData[];
  nonSelectedDevices: DeviceSelectionData[];
  selectedSectionTitle: string;
  availableSectionTitle: string;
  renderDeviceItem: (device: DeviceSelectionData, index: number) => React.ReactNode;
  qaId?: string;
}

/**
 * Renders the event device selection content UI section.
 */
export const EventDeviceSelectionContent: React.FC<
  EventDeviceSelectionContentProps
> = ({
  selectedDevices,
  nonSelectedDevices,
  selectedSectionTitle,
  availableSectionTitle,
  renderDeviceItem,
  qaId = "device_selection",
}) => {
  const sectionTitleStyle = [
    globalStyles.fontSm,
    globalStyles.fontMedium,
    globalStyles.textPrimary,
  ];

  return (
    <ScrollView
      {...testProps(`scroll_${qaId}`)}
      style={{ flex: 1, marginBottom: 80 }}
    >
      {selectedDevices.length > 0 && (
        <View
          {...testProps(`view_selected_${qaId}`)}
          style={{ padding: tokens.spacing._15, paddingBottom: 0 }}
        >
          <View style={{ marginBottom: tokens.spacing._10 }}>
            <Text {...testProps(`text_selected_${qaId}`)} style={sectionTitleStyle}>
              {selectedSectionTitle}
            </Text>
          </View>
          {selectedDevices.map((device, index) =>
            renderDeviceItem(device, index)
          )}
        </View>
      )}

      {nonSelectedDevices.length > 0 && (
        <View
          {...testProps(`view_available_${qaId}`)}
          style={{ flex: 1, padding: tokens.spacing._15 }}
        >
          <View style={{ marginBottom: tokens.spacing._10 }}>
            <Text {...testProps(`text_available_${qaId}`)} style={sectionTitleStyle}>
              {availableSectionTitle}
            </Text>
          </View>
          {nonSelectedDevices.map((device, index) =>
            renderDeviceItem(device, index)
          )}
        </View>
      )}
    </ScrollView>
  );
};
