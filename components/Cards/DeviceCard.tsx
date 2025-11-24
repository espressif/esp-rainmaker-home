/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  useWindowDimensions,
  TouchableOpacity,
} from "react-native";

// Components
import { Switch } from "tamagui";

// Navigation
import { router } from "expo-router";

// SDK
import {
  ESPRMDevice,
  ESPRMNode,
  ESPRMDeviceParam,
  ESPTransportMode,
  ESPTransportConfig,
} from "@espressif/rainmaker-base-sdk";

// Hooks
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/useToast";

// Utils
import { getDeviceImage, extractDeviceType } from "@/utils/device";

// Constants
import {
  ESPRM_NAME_PARAM_TYPE,
  ESPRM_POWER_PARAM_TYPE,
  ERROR_CODES,
  ESPRM_TEMPERATURE_PARAM_TYPE,
  MATTER_METADATA_KEY,
  MATTER_METADATA_DEVICE_NAME_KEY,
} from "@/utils/constants";

// Styles
import { globalStyles } from "@/theme/globalStyleSheet";
import { tokens } from "@/theme/tokens";

// Icons
import { Lock } from "lucide-react-native";

import { testProps } from "../../utils/testProps";
// Types
interface DeviceCardProps {
  /** Node containing the device */
  node: ESPRMNode;
  /** Device to display */
  device: ESPRMDevice;
  /** Whether to use compact layout */
  compact?: boolean;
  /** QA automation identifier */
  qaId?: string;
}

interface ParamTypeMap {
  [key: string]: ESPRMDeviceParam;
}

/**
 * DeviceCard
 *
 * A card component for displaying and controlling IoT devices.
 * Features:
 * - Device status display
 * - Power control
 * - Online/offline state
 * - Compact mode support
 * - Device type specific icons
 */
const DeviceCard: React.FC<DeviceCardProps> = ({
  node,
  device,
  compact = false,
  qaId,
}) => {
  const toast = useToast();
  const { t } = useTranslation();
  const [paramTypeMap, setParamTypeMap] = useState<ParamTypeMap>({});
  const [isPowerParamExisit, setIsPowerParamExisit] = useState<boolean>(false);

  const isConnected = node.connectivityStatus?.isConnected || false;
  const isAvailableLocally = useMemo(() => {
    const availableTransports = node.availableTransports as Record<
      ESPTransportMode,
      ESPTransportConfig
    >;
    const localTransport = availableTransports[ESPTransportMode.local];
    if (localTransport) {
      return localTransport.metadata.baseUrl.length > 0;
    }
    return false;
  }, [node.availableTransports]);

  /**
   * useEffect to set the paramTypeMap and isPowerParamExisit
   */
  useEffect(() => {
    if (device) {
      const paramTypeMap = device.params?.reduce((acc, param) => {
        acc[param.type] = param;
        return acc;
      }, {} as ParamTypeMap);

      setParamTypeMap(paramTypeMap || {});
      setIsPowerParamExisit(
        device.params?.some((param) => param.type === ESPRM_POWER_PARAM_TYPE) ||
          false
      );

      if (extractDeviceType(device.type) === "temperature") {
      }
    }
  }, [device]);

  /**
   * Handle device control
   * Navigates to the control screen for the device
   *
   * @returns {void}
   */
  const handleDeviceControl = () => {
    router.push({
      pathname: "/(device)/Control",
      params: {
        id: node.id,
        device: device.name,
      },
    } as any);
  };

  // STYLE : card width
  const { width } = useWindowDimensions();
  let cardWidth = 180;
  if (width <= 500) {
    cardWidth = (width - tokens.spacing._15 * 2) / 2 - 6;
  }

  /**
   * Handle device power control
   * Sets the power state of the device
   *
   * @param {ESPRMDevice} device - The device to control
   * @param {boolean} value - The power state to set
   * @returns {void}
   */
  const handleDevicePowerControl = (device: ESPRMDevice, value: boolean) => {
    const powerParam: ESPRMDeviceParam | undefined = device?.params?.find(
      (param) => param.type === ESPRM_POWER_PARAM_TYPE
    );
    if (powerParam) {
      powerParam
        .setValue(value)
        .then(() => {})
        .catch((err) => {
          toast.showError(t(ERROR_CODES[err.code as keyof typeof ERROR_CODES]));
        });
    }
  };

  // Render compact card
  if (compact) {
    return (
      <View {...(qaId ? testProps(qaId) : {})}  style={styles.compactCard} key={device.name}>
        <Image
          {...testProps("icon_device_card")}
          source={getDeviceImage(device.type, isConnected)}
          style={[styles.image, { marginBottom: 5 }]}
        />

        <Text
          {...testProps("text_device_name")}
          style={[
            styles.name,
            { marginBottom: 5, paddingRight: 0, textAlign: "center" },
          ]}
        >
          {device.displayName}
        </Text>

        {isPowerParamExisit && (
          <Switch
            {...testProps("switch_device_power")}
            size="$2.5"
            borderColor={tokens.colors.bg1}
            borderWidth={0}
            checked={paramTypeMap[ESPRM_POWER_PARAM_TYPE]?.value || false}
            disabled={!isConnected}
            style={[
              globalStyles.switch,
              !isConnected && globalStyles.deviceCardDisabled,
            ]}
            onCheckedChange={(value) => handleDevicePowerControl(device, value)}
          >
            <Switch.Thumb
              animation="quicker"
              style={
                paramTypeMap[ESPRM_POWER_PARAM_TYPE]?.value
                  ? globalStyles.switchThumbActive
                  : globalStyles.switchThumb
              }
            />
          </Switch>
        )}
      </View>
    );
  }

  const getOnValue = () => {
    if (extractDeviceType(device.type) === "temperature-sensor") {
      return isConnected;
    }
    return paramTypeMap[ESPRM_POWER_PARAM_TYPE]?.value;
  };

  const getDeviceName = (node: ESPRMNode) => {
    // Check if node metadata contains Matter key
    const metadata = node.metadata;
    if (metadata && metadata[MATTER_METADATA_KEY]) {
      const deviceName =
        metadata[MATTER_METADATA_KEY][MATTER_METADATA_DEVICE_NAME_KEY];
      if (deviceName) {
        return deviceName;
      }
    }
    // Return empty string as fallback
    return "";
  };

  // Render full card
  return (
    <TouchableOpacity {...(qaId ? testProps(qaId) : {})}
      key={device.name}
      style={[
        styles.card,
        {
          padding: 10,
          width: cardWidth,
          opacity: !isConnected ? 0.7 : 1,
          backgroundColor: !isConnected
            ? tokens.colors.bg2
            : tokens.colors.white,
        },
      ]}
      onPress={handleDeviceControl}
    >
      <View style={styles.flexWrap}>
        <Image
          {...testProps("icon_device_card")}
          source={getDeviceImage(device.type, getOnValue())}
          style={styles.image}
        />
        {isPowerParamExisit && (
          <Switch
            {...testProps("switch_device_power")}
            size="$2.5"
            borderColor={tokens.colors.bg1}
            borderWidth={0}
            checked={paramTypeMap[ESPRM_POWER_PARAM_TYPE]?.value || false}
            disabled={!isConnected}
            style={[
              globalStyles.switch,
              !isConnected && globalStyles.deviceCardDisabled,
            ]}
            onCheckedChange={(value) => handleDevicePowerControl(device, value)}
          >
            <Switch.Thumb
              animation="quicker"
              style={
                paramTypeMap[ESPRM_POWER_PARAM_TYPE]?.value
                  ? globalStyles.switchThumbActive
                  : globalStyles.switchThumb
              }
            />
          </Switch>
        )}
        {paramTypeMap[ESPRM_TEMPERATURE_PARAM_TYPE]?.value && (
          <Text style={styles.textValue} numberOfLines={1}>
            {paramTypeMap[ESPRM_TEMPERATURE_PARAM_TYPE]?.value.toFixed(1)}
            °C
          </Text> 
        )}
      </View>

      <View style={{ width: "100%", paddingLeft: 5 }}>
        <View>
          <Text {...testProps("text_device_name")} style={styles.name} numberOfLines={1}>
            {getDeviceName(node) || paramTypeMap[ESPRM_NAME_PARAM_TYPE]?.value || device.displayName}
          </Text>
        </View>
        <View style={styles.statusContainer}>
          {isConnected ? (
            isAvailableLocally ? (
              <View style={styles.wlanIndicator}>
                <Lock size={12} color={tokens.colors.primary} />
                <Text {...testProps("text_local_control_device_card")} style={styles.wlanText}>
                  {t("device.availableOnWLAN")}
                </Text>
              </View>
            ) : (
              <Text style={styles.status}></Text>
            )
          ) : (
            <Text {...testProps("text_offline_device_card")} style={styles.status}>{t("layout.shared.offline")}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  card: {
    position: "relative",
    marginTop: 12,
    padding: tokens.spacing._15,
    backgroundColor: tokens.colors.white,
    textAlign: "center",
    alignItems: "center",
    justifyContent: "center",
    color: tokens.colors.gray,
    ...globalStyles.shadowElevationForLightTheme,
  },
  flexWrap: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  image: {
    width: 46,
    height: 46,
    marginBottom: 5,
  },
  name: {
    marginTop: 4,
    paddingRight: 0,
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.gray,
    fontFamily: tokens.fonts.medium,
    width: "100%",
  },
  status: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.gray,
    fontFamily: tokens.fonts.regular,
  },
  statusContainer: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  wlanIndicator: {
    flexDirection: "row",
    alignItems: "center",
  },
  wlanText: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.primary,
    fontFamily: tokens.fonts.regular,
    marginLeft: 4,
  },
  compactCard: {
    width: 85,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-between",
    textAlign: "center",
  },
  textValue: {
    textAlign: "right",
    paddingRight: 10,
    fontSize: tokens.fontSize.md,
    color: tokens.colors.gray,
  },
});

export default observer(DeviceCard);
