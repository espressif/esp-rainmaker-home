/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
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
  getDeviceReachability,
  resolveDeviceCardRoutePath,
} from "@shared/utils/device";
import { parseBridgedChildParentNodeId } from "@shared/utils/matterLocalReachability";
import { resolveDeviceCardPowerParam } from "@shared/utils/deviceParams";
import {
  getDeviceCardSensorReadings,
} from "@shared/utils/deviceCardSensor";
import { coerceParamValueToBoolean } from "@shared/utils/paramUtils";
import { resolveNodeUnavailableMessage } from "@shared/utils/connectivity";

// Constants
import {
  DEVICE_REACHABILITY_SOURCE_BRIDGE,
  DEVICE_REACHABILITY_SOURCE_CONTROLLER,
  DEVICE_REACHABILITY_SOURCE_LOCAL,
  POWER_PARAM_UNSUPPORTED_DEVICE_TYPES,
  ESPRM_NAME_PARAM_TYPE,
  ERROR_CODES,
  MATTER_METADATA_KEY,
  MATTER_METADATA_DEVICE_NAME_KEY,
  PARAM_INCOMING_UPDATE_DEBOUNCE_MS,
} from "@shared/utils/constants";

// Styles
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";

// Icons
import { RadioTower, Share2, Wifi, WifiOff } from "lucide-react-native";

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
  const [isPowerOn, setIsPowerOn] = useState(() =>
    coerceParamValueToBoolean(cardPowerParam?.value),
  );
  const powerUpdateDelayTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const registeredTransports =
    store.subscriptionStore.registeredTransports[node.id];
  const bridgeParentNodeId = parseBridgedChildParentNodeId(storeNode.id);
  const bridgeParentTransports = bridgeParentNodeId
    ? store.subscriptionStore.registeredTransports[bridgeParentNodeId]
    : undefined;

  const { reachable: deviceConnected, source: reachabilitySource } =
    getDeviceReachability(
      storeNode,
      registeredTransports,
      bridgeParentTransports,
    );
  const availableLocally =
    reachabilitySource === DEVICE_REACHABILITY_SOURCE_LOCAL;
  const availableViaBridge =
    reachabilitySource === DEVICE_REACHABILITY_SOURCE_BRIDGE;
  const availableViaController =
    reachabilitySource === DEVICE_REACHABILITY_SOURCE_CONTROLLER;

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
   * Debounces adopting store/MQTT `param.value` into local Switch state so an
   * in-flight update does not clobber an optimistic power toggle (same pattern
   * as ParamControlWrap slider incoming sync).
   */
  useEffect(() => {
    if (!cardPowerParam) {
      return;
    }

    if (powerUpdateDelayTimeoutRef.current === null) {
      setIsPowerOn(coerceParamValueToBoolean(cardPowerParam.value));
    }

    if (powerUpdateDelayTimeoutRef.current !== null) {
      clearTimeout(powerUpdateDelayTimeoutRef.current);
    }
    powerUpdateDelayTimeoutRef.current = setTimeout(() => {
      setIsPowerOn(coerceParamValueToBoolean(cardPowerParam.value));
      powerUpdateDelayTimeoutRef.current = null;
    }, PARAM_INCOMING_UPDATE_DEBOUNCE_MS);

    return () => {
      if (powerUpdateDelayTimeoutRef.current !== null) {
        clearTimeout(powerUpdateDelayTimeoutRef.current);
      }
    };
  }, [cardPowerParam, cardPowerParam?.value, isPowerOn]);

  /**
   * Opens Control or Settings for this device based on devices.config routing.
   * System-only types (e.g. Matter Controller) skip Control and land on Settings.
   */
  const handleDeviceControl = () => {
    const deviceType = extractDeviceType(device.type);
    router.push({
      pathname: resolveDeviceCardRoutePath(deviceType),
      params: {
        id: node.id,
        device: device.name,
      },
    } as any);
  };

  /**
   * Optimistically updates local power UI, then persists via `param.setValue`.
   * Arms the incoming-update debounce first so the sync effect does not
   * immediately re-apply a stale store value after a quiet period.
   * @param value - Target power state
   */
  const handleDevicePowerControl = (value: boolean) => {
    if (!cardPowerParam) {
      return;
    }

    if (powerUpdateDelayTimeoutRef.current !== null) {
      clearTimeout(powerUpdateDelayTimeoutRef.current);
    }
    powerUpdateDelayTimeoutRef.current = setTimeout(() => {
      setIsPowerOn(coerceParamValueToBoolean(cardPowerParam.value));
      powerUpdateDelayTimeoutRef.current = null;
    }, PARAM_INCOMING_UPDATE_DEBOUNCE_MS);

    setIsPowerOn(value);
    cardPowerParam.setValue(value).catch((err) => {
      setIsPowerOn(coerceParamValueToBoolean(cardPowerParam.value));
      toast.showError(t(ERROR_CODES[err.code as keyof typeof ERROR_CODES]));
    });
  };

  const isEndpointSplitDevice = /^ep_[0-9a-f]+$/i.test(device.name ?? "");

  /**
   * Matter metadata device name (fallback only — name param / displayName win for sync).
   */
  const getMatterMetadataDeviceName = (cdfNode: ESPCDFNode) => {
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

  /**
   * Home card title: live name param and synced `displayName` beat stale Matter metadata
   * so a rename on another phone is visible after subscription/param sync.
   */
  const resolveCardTitle = () => {
    if (isEndpointSplitDevice && device.displayName) {
      return device.displayName;
    }
    const nameParamValue = paramTypeMap[ESPRM_NAME_PARAM_TYPE]?.value;
    if (typeof nameParamValue === "string" && nameParamValue.trim().length > 0) {
      return nameParamValue;
    }
    if (device.displayName) {
      return device.displayName;
    }
    return getMatterMetadataDeviceName(storeNode) || "";
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
            globalStyles.controlGroupCardName,
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
  const offlineLabel = !deviceConnected
    ? resolveNodeUnavailableMessage(
        storeNode.connectivityStatus?.isConnected,
        storeNode.connectivityStatus?.lastConnectionTimestamp,
        t,
      )
    : null;

  // Render full card
  return (
    <TouchableOpacity
      {...(qaId ? testProps(qaId) : {})}
      key={device.name}
      style={[
        globalStyles.controlGroupCard,
        globalStyles.shadowElevationForLightTheme,
        {
          padding: tokens.spacing._10,
          width: cardWidth,
          opacity: deviceConnected ? 1 : 0.7,
          backgroundColor: !deviceConnected
            ? tokens.colors.bg2
            : tokens.colors.white,
        },
        !deviceConnected && globalStyles.offlineCardNoShadow,
      ]}
      onPress={handleDeviceControl}
    >
      {deviceConnected && availableLocally && (
        <View
          {...testProps("icon_local_control_device_card")}
          style={styles.reachabilityBadge}
        >
          <Wifi size={11} color={tokens.colors.lightGray} />
          <Text
            {...testProps("text_local_control_device_card")}
            style={styles.reachabilityLabel}
          >
            {t("device.reachability.wlan")}
          </Text>
        </View>
      )}
      {deviceConnected && availableViaBridge && (
        <View
          {...testProps("icon_bridge_device_card")}
          style={styles.reachabilityBadge}
        >
          <Share2 size={11} color={tokens.colors.lightGray} />
          <Text
            {...testProps("text_bridge_device_card")}
            style={styles.reachabilityLabel}
          >
            {t("device.reachability.bridge")}
          </Text>
        </View>
      )}
      {deviceConnected && availableViaController && (
        <View
          {...testProps("icon_controller_device_card")}
          style={styles.reachabilityBadge}
        >
          <RadioTower size={11} color={tokens.colors.lightGray} />
          <Text
            {...testProps("text_controller_device_card")}
            style={styles.reachabilityLabel}
          >
            {t("device.reachability.controller")}
          </Text>
        </View>
      )}
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

      <View style={globalStyles.controlGroupCardNameBlock}>
        <Text
          {...testProps("text_device_name")}
          style={globalStyles.controlGroupCardName}
          numberOfLines={1}
        >
          {resolveCardTitle()}
        </Text>
        <View style={styles.offlineStatusRow}>
          {offlineLabel != null ? (
            <>
              <WifiOff size={11} color={tokens.colors.gray} />
              <Text
                {...testProps("text_offline_device_card")}
                style={globalStyles.controlGroupCardStatus}
                numberOfLines={1}
              >
                {offlineLabel}
              </Text>
            </>
          ) : (
            <Text style={globalStyles.controlGroupCardStatus} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
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
  offlineStatusRow: {
    minHeight: tokens.fontSize.xs + 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  reachabilityBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    zIndex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    opacity: 0.65,
  },
  reachabilityLabel: {
    fontSize: tokens.fontSize.xxs,
    color: tokens.colors.lightGray,
    fontFamily: tokens.fonts.regular,
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
