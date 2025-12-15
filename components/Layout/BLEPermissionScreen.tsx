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
import { BluetoothOff, MapPin } from "lucide-react-native";

// Utils
import { testProps } from "@/utils/testProps";

// Types
import { BLEPermissionScreenProps } from "@/types/global";

/**
 * BLEPermissionScreen
 *
 * Reusable component that displays a permission request screen when BLE or Location permissions are missing.
 * Used in device scanning screens (BLE, QR).
 *
 * @param status - The permission status ("requesting" or "denied")
 * @param missingPermission - Which permission is missing ("ble", "location", "both", or "none")
 * @param testIdPrefix - Optional prefix for test IDs (default: "scan")
 */
const BLEPermissionScreen: React.FC<BLEPermissionScreenProps> = ({
  status,
  missingPermission,
  testIdPrefix = "scan",
}) => {
  const { t } = useTranslation();

  const getTitle = () => {
    if (status === "requesting") {
      return t("device.scan.ble.requestingPermission");
    }
    if (missingPermission === "ble") {
      return t("device.scan.ble.noBlePermission");
    }
    if (missingPermission === "location") {
      return t("device.scan.ble.noLocationPermission");
    }
    return t("device.scan.ble.permissionRequired");
  };

  const getDescription = () => {
    if (missingPermission === "ble") {
      return t("device.scan.ble.blePermissionRequired");
    }
    if (missingPermission === "location") {
      return t("device.scan.ble.locationPermissionRequired");
    }
    return t("device.scan.ble.allPermissionsRequired");
  };

  const getIcon = () => {
    if (missingPermission === "location") {
      return <MapPin size={40} color={tokens.colors.gray} />;
    }
    return <BluetoothOff size={40} color={tokens.colors.gray} />;
  };

  return (
    <View
      {...testProps(`view_permission_screen_${testIdPrefix}`)}
      style={[
        globalStyles.container,
        globalStyles.itemCenter,
      ]}
    >
      <View
        {...testProps(`view_permission_content_${testIdPrefix}`)}
        style={[
          globalStyles.permissionContent
        ]}
      >
        <View {...testProps(`view_permission_icon_${testIdPrefix}`)} style={globalStyles.permissionIconContainer}>
          {getIcon()}
        </View>
        <Text {...testProps(`text_permission_title_${testIdPrefix}`)} style={[globalStyles.heading, globalStyles.permissionTitle]}>
          {getTitle()}
        </Text>
        <Text
          {...testProps(`text_permission_msg_${testIdPrefix}`)}
          style={[globalStyles.textGray, globalStyles.permissionDescription]}
        >
          {getDescription()}
        </Text>
      </View>
    </View>
  );
};


export default BLEPermissionScreen;
