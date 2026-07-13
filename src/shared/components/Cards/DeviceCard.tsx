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
import { useCDF } from "@shared/hooks/useCDF";
// Utils
import {
  extractDeviceType,
  getDeviceImage,
  isDeviceConnected,
  isDeviceLocallyAvailable,
} from "@shared/utils/device";
import { parseBridgedChildParentNodeId } from "@shared/utils/matterLocalReachability";
import { resolveDeviceCardPowerParam } from "@shared/utils/deviceParams";
import {
  getDeviceCardSensorReadings,
} from "@shared/utils/deviceCardSensor";
import { coerceParamValueToBoolean } from "@shared/utils/paramUtils";

// Constants
import {
  POWER_PARAM_UNSUPPORTED_DEVICE_TYPES,
  ESPRM_NAME_PARAM_TYPE,
  ERROR_CODES,
  MATTER_METADATA_KEY,
  MATTER_METADATA_DEVICE_NAME_KEY
} from "@shared/utils/constants";

// Styles
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";

// Icons
import { Lock } from "lucide-react-native";

import { testProps, stateTestProps } from "@shared/utils/testProps";
import {
  ESPCDFDevice,
  ESPCDFDeviceParam,
  ESPCDFNode,
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
  const { store } = useCDF();
  const { width } = useWindowDimensions();

  const storeNode = store.nodeStore.nodesByIDMap[node.id] ?? node;
  const storeDevice =
    storeNode.devices?.find((d) => d.name === device.name) ?? device;

  const cardPowerParam = resolveDeviceCardPowerParam(storeDevice);
  const isPowerParamExisit = Boolean(cardPowerParam);
  const isPowerOn = coerceParamValueToBoolean(cardPowerParam?.value);
  const registeredTransports =
    store.subscriptionStore.registeredTransports[node.id];
  const bridgeParentNodeId = parseBridgedChildParentNodeId(storeNode.id);
  const bridgeParentTransports = bridgeParentNodeId
    ? store.subscriptionStore.registeredTransports[bridgeParentNodeId]
    : undefined;

  const deviceConnected = isDeviceConnected(
    storeNode,
    registeredTransports,
    bridgeParentTransports,
  );
  const availableLocally = isDeviceLocallyAvailable(
    storeNode,
    registeredTransports,
    bridgeParentTransports,
  );

  let cardWidth = 180;
  if (width <= 500) {
    cardWidth = (width - tokens.spacing._15 * 2) / 2 - 6;
  }

  /**
   * Builds paramTypeMap for non-power card fields (name).
   */
  useEffect(() => {
    if (storeDevice) {
      const nextParamTypeMap = storeDevice.params?.reduce((acc, param) => {
        acc[param.type || ""] = param;
        return acc;
      }, {} as ParamTypeMap);

      setParamTypeMap(nextParamTypeMap || {});
    }
  }, [storeDevice]);

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

  /**
   * Handle device power control
   * Sets the power state of the device
   * @param device - The device to control
   * @param value - The power state to set
   */
  const handleDevicePowerControl = (value: boolean) => {
    if (!cardPowerParam) {
      return;
    }
    cardPowerParam
      .setValue(value)
      .then(() => {})
      .catch((err) => {
        toast.showError(t(ERROR_CODES[err.code as keyof typeof ERROR_CODES]));
      });
  };

  const isEndpointSplitDevice = /^ep_[0-9a-f]+$/i.test(device.name ?? "");

  const getDeviceName = (cdfNode: ESPCDFNode) => {
    const metadata = cdfNode.metadata;
    if (metadata && metadata[MATTER_METADATA_KEY]) {
      const deviceName =
        metadata[MATTER_METADATA_KEY][MATTER_METADATA_DEVICE_NAME_KEY];
      if (deviceName) {
        return deviceName;
      }
    }
    return "";
  };

  const resolveCardTitle = () => {
    if (isEndpointSplitDevice && device.displayName) {
      return device.displayName;
    }
    return (
      getDeviceName(storeNode) ||
      paramTypeMap[ESPRM_NAME_PARAM_TYPE]?.value ||
      device.displayName
    );
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
          source={getDeviceImage(device.type, deviceConnected)}
          style={[styles.image, { marginBottom: 5 }]}
        />

        <Text
          {...testProps("text_device_name")}
          style={[
            styles.name,
            { marginBottom: 5, paddingRight: 0, textAlign: "center" },
          ]}
        >
          {resolveCardTitle()}
        </Text>

        {isPowerParamExisit && (
          <Switch
            {...testProps("switch_device_power")}
            size="$2.5"
            borderColor={tokens.colors.bg1}
            borderWidth={0}
            checked={isPowerOn}
            disabled={!deviceConnected}
            style={[
              globalStyles.switch,
              !deviceConnected && globalStyles.deviceCardDisabled,
            ]}
            onCheckedChange={handleDevicePowerControl}
          >
            <Switch.Thumb
              {...stateTestProps("card_power_state", isPowerOn)}
              animation="quicker"
              style={
                isPowerOn
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
      return deviceConnected;
    }
    return isPowerOn;
  };

  const sensorCardDisplay = getDeviceCardSensorReadings(device).join(" · ");

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
          opacity: !deviceConnected ? 0.7 : 1,
          backgroundColor: !deviceConnected
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
            checked={isPowerOn}
            disabled={!deviceConnected}
            style={[
              globalStyles.switch,
              !deviceConnected && globalStyles.deviceCardDisabled,
            ]}
            onCheckedChange={handleDevicePowerControl}
          >
            <Switch.Thumb
              {...stateTestProps("card_power_state", isPowerOn)}
              animation="quicker"
              style={
                isPowerOn
                  ? globalStyles.switchThumbActive
                  : globalStyles.switchThumb
              }
            />
          </Switch>
        )}
        {sensorCardDisplay.length > 0 && (
          <Text style={styles.textValue} numberOfLines={2}>
            {sensorCardDisplay}
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
            {resolveCardTitle()}
          </Text>
        </View>
        <View style={styles.statusContainer}>
          {deviceConnected ? (
            availableLocally ? (
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
