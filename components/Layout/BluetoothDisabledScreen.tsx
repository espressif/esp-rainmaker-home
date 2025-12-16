/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text } from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Hooks
import { useTranslation } from "react-i18next";

// Icons
import { BluetoothOff } from "lucide-react-native";

// Utils
import { testProps } from "@/utils/testProps";

/**
 * BluetoothDisabledScreen
 *
 * Reusable component that displays a warning screen when Bluetooth is turned off.
 * Shows only the warning message with icon and text, no action button.
 */
const BluetoothDisabledScreen: React.FC = () => {
  const { t } = useTranslation();

  return (
    <View
      {...testProps("view_bluetooth_disabled_screen")}
      style={[
        globalStyles.container,
        globalStyles.itemCenter,
      ]}
    >
      <View
        {...testProps("view_bluetooth_disabled_content")}
        style={[
          globalStyles.permissionContent
        ]}
      >
        <View {...testProps("view_bluetooth_disabled_icon")} style={globalStyles.permissionIconContainer}>
          <BluetoothOff size={40} color={tokens.colors.gray} />
        </View>
        <Text {...testProps("text_bluetooth_disabled_title")} style={[globalStyles.heading, globalStyles.permissionTitle]}>
          {t("device.scan.ble.bluetoothDisabled")}
        </Text>
        <Text
          {...testProps("text_bluetooth_disabled_msg")}
          style={[globalStyles.textGray, globalStyles.permissionDescription]}
        >
          {t("device.scan.ble.bluetoothDisabledMessage")}
        </Text>
      </View>
    </View>
  );
};

export default BluetoothDisabledScreen;
