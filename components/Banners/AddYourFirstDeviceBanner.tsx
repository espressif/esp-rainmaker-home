/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  View,
  StyleSheet,
  Text,
  Image,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Pressable,
} from "react-native";

// Styles
import { globalStyles } from "@/theme/globalStyleSheet";
import { tokens } from "@/theme/tokens";

// Constants
import { deviceImages } from "@/utils/device";

// config
import { DEVICE_TYPE_LIST } from "@/config/devices.config";

// Hooks
import { useTranslation } from "react-i18next";

// Icons
import { Plus } from "lucide-react-native";

import { testProps } from "../../utils/testProps";
// Types
interface AddYourFirstDeviceBannerProps {
  /** Navigation callback for different operations */
  redirectOperations: (operation: string) => void;
  /** QA automation identifier */
  qaId?: string;
}

/**
 * AddYourFirstDeviceBanner
 *
 * A banner component displayed when no devices are added.
 * Shows available device types and provides an add device button.
 * Supports pull-to-refresh functionality.
 */
const AddYourFirstDeviceBanner: React.FC<AddYourFirstDeviceBannerProps> = ({
  redirectOperations,
  qaId,
}) => {
  const { t } = useTranslation();
  const availableDevices = DEVICE_TYPE_LIST.filter(
    (device) => !device.disabled
  );

  return (
    <Pressable {...(qaId ? testProps(qaId) : {})}
      style={[
        {
          width: "100%",
        },
        styles.noDeviceContainer,
        globalStyles.bgWhite,
        globalStyles.radiusMd,
      ]}
    >
      <Text {...testProps("text_add_first_device_title")} style={[globalStyles.heading, globalStyles.textCenter]}>
        {t("group.home.addYourFirstDeviceBannerTitle")}
      </Text>
      <Text
        style={[
          globalStyles.textGray,
          globalStyles.textCenter,
          styles.noDeviceDesc,
        ]}
      >
        {t("group.home.addYourFirstDeviceBannerDescription")}
      </Text>

      <View
        style={[
          globalStyles.flex,
          globalStyles.justifyCenter,
          styles.deviceTypesContainer,
        ]}
      >
        {availableDevices.slice(0, 3).map((device, index) => (
          <View key={index} style={styles.deviceImageContainer}>
            <Image
              source={deviceImages[device.defaultIcon]}
              style={styles.deviceTypeImage}
              resizeMode="contain"
            />
          </View>
        ))}
      </View>

      <TouchableOpacity
        {...testProps("button_add_device_banner")}
        style={styles.addButton}
        onPress={() => redirectOperations("AddDevice")}
      >
        <Plus {...testProps("icon_add_device")} size={24} color={tokens.colors.white} />
      </TouchableOpacity>
    </Pressable>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  noDeviceContainer: {
    marginTop: tokens.spacing._15,
    padding: tokens.spacing._20,
    ...globalStyles.shadowElevationForLightTheme,
  },
  noDeviceDesc: {
    marginBottom: tokens.spacing._20,
  },
  deviceTypesContainer: {
    marginBottom: tokens.spacing._20,
  },
  deviceTypeImage: {
    width: 50,
    height: 50,
  },
  deviceImageContainer: {
    marginHorizontal: tokens.spacing._10,
    borderRadius: 25,
    padding: tokens.spacing._10,
  },
  addButton: {
    width: 50,
    height: 50,
    margin: "auto",
    borderRadius: 25,
    backgroundColor: tokens.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: tokens.spacing._10,
  },
});

export default AddYourFirstDeviceBanner;
