/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
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

// Hooks
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import { useToast } from "@shared/hooks/useToast";

// Utils
import { getDeviceImage, extractDeviceType } from "@shared/utils/device";

// Constants
import {
  POWER_PARAM_UNSUPPORTED_DEVICE_TYPES,
  ESPRM_NAME_PARAM_TYPE,
  ESPRM_POWER_PARAM_TYPE,
  ERROR_CODES,
  ESPRM_TEMPERATURE_PARAM_TYPE,
  MATTER_METADATA_KEY,
  MATTER_METADATA_DEVICE_NAME_KEY,
  ESPRM_LOCAL_CONTROL_SERVICE,
  ESPRM_LOCAL_CONTROL_TYPE_PARAM_TYPE,
  ESPRM_LOCAL_CONTROL_POP_PARAM_TYPE,
} from "@shared/utils/constants";

// Styles
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";

// Icons
import { Lock } from "lucide-react-native";

import { testProps } from "@shared/utils/testProps";
import {
  ESPCDFDevice,
  ESPCDFDeviceParam,
  ESPCDFNode,
  ESPCDFNodeTransport,
  ESPCDFTransportConfig,
} from "@store";
// Types
interface DeviceCardProps {
  /** Node containing the device */
  node: ESPCDFNode;
  /** Device to display */
  device: ESPCDFDevice;
  /** Whether to use compact layout */
  compact?: boolean;
  /** QA automation identifier */
  qaId?: string;
}

interface ParamTypeMap {
  [key: string]: ESPCDFDeviceParam;
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

  // Read during render so observer() re-renders when node.availableTransports (or its "local" entry) changes
  const availableTransports = node.availableTransports as
    | Record<string, ESPCDFTransportConfig>
    | undefined;
  const localTransport = availableTransports?.[ESPCDFNodeTransport.LOCAL];
  const localControlService = node.services?.find(
    (service) => service.type === ESPRM_LOCAL_CONTROL_SERVICE
  );
  const hasLocalControlParams = Boolean(
    localControlService?.params?.some(
      (param) =>
        param.type === ESPRM_LOCAL_CONTROL_TYPE_PARAM_TYPE ||
        param.type === ESPRM_LOCAL_CONTROL_POP_PARAM_TYPE
    )
  );
  const isAvailableLocally = Boolean(
    hasLocalControlParams &&
    localTransport?.metadata?.baseUrl != null &&
    String(localTransport.metadata.baseUrl).trim().length > 0,
  );

  /**
   * useEffect to set the paramTypeMap and isPowerParamExisit
   */
  useEffect(() => {
    if (device) {
      const paramTypeMap = device.params?.reduce((acc, param) => {
        acc[param.type || ""] = param;
        return acc;
      }, {} as ParamTypeMap);

      setParamTypeMap(paramTypeMap || {});
      setIsPowerParamExisit(
        device.params?.some((param) => param.type === ESPRM_POWER_PARAM_TYPE) ||
          false,
      );
    }
  }, [device]);

  /**
   * Handle device control
   * Navigates to the control screen for the device
   */
  const handleDeviceControl = () => {
    router.push({
      pathname: "/(control)/Control",
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
   * @param device - The device to control
   * @param value - The power state to set
   */
  const handleDevicePowerControl = (device: ESPCDFDevice, value: boolean) => {
    const powerParam: ESPCDFDeviceParam | undefined = device?.params?.find(
      (param) => param.type === ESPRM_POWER_PARAM_TYPE,
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
      <View
        {...(qaId ? testProps(qaId) : {})}
        style={styles.compactCard}
        key={device.name}
      >
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
    const extractedDeviceType = extractDeviceType(device.type);
    if (POWER_PARAM_UNSUPPORTED_DEVICE_TYPES.has(extractedDeviceType)) {
      return isConnected;
    }
    return paramTypeMap[ESPRM_POWER_PARAM_TYPE]?.value;
  };

  /**
   * Formats temperature value for card display safely.
   * Returns null when value is not a finite number.
   */
  const getFormattedTemperature = (): string | null => {
    const temperatureValue = paramTypeMap[ESPRM_TEMPERATURE_PARAM_TYPE]?.value;
    return typeof temperatureValue === "number" && Number.isFinite(temperatureValue)
      ? `${temperatureValue.toFixed(1)}°C`
      : null;
  };

  const getDeviceName = (node: ESPCDFNode) => {
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
    <TouchableOpacity
      {...(qaId ? testProps(qaId) : {})}
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
        {getFormattedTemperature() && (
          <Text style={styles.textValue} numberOfLines={1}>
            {getFormattedTemperature()}
          </Text>
        )}
      </View>

      <View style={{ width: "100%", paddingLeft: 5 }}>
        <View>
          <Text
            {...testProps("text_device_name")}
            style={styles.name}
            numberOfLines={1}
          >
            {getDeviceName(node) ||
              paramTypeMap[ESPRM_NAME_PARAM_TYPE]?.value ||
              device.displayName}
          </Text>
        </View>
        <View style={styles.statusContainer}>
          {isConnected ? (
            isAvailableLocally ? (
              <View style={styles.wlanIndicator}>
                <Lock size={12} color={tokens.colors.primary} />
                <Text
                  {...testProps("text_local_control_device_card")}
                  style={styles.wlanText}
                >
                  {t("device.availableOnWLAN")}
                </Text>
              </View>
            ) : (
              <Text style={styles.status}></Text>
            )
          ) : (
            <Text
              {...testProps("text_offline_device_card")}
              style={styles.status}
            >
              {t("layout.shared.offline")}
            </Text>
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
