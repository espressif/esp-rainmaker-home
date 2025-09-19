/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Animated,
  ActivityIndicator,
} from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// SDK
import { ESPDevice } from "@espressif/rainmaker-base-sdk";

// Hooks
import { useCDF } from "@/hooks/useCDF";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

// Icons
import { Bluetooth, RotateCcw } from "lucide-react-native";

// Components
import { Header, ScreenWrapper, ContentWrapper } from "@/components";

// Utils
import { deviceImages } from "@/utils/device";
import { useToast } from "@/hooks/useToast";

// config
import { DEVICE_TYPE_LIST } from "@/config/devices.config";

// Types
interface DeviceTypeProps {
  label: string;
  defaultIcon: string;
  disabled: boolean;
  onPress: () => void;
  style?: any;
}

interface ScannedDeviceProps {
  name: string;
  type: string;
  onPress: () => void;
}

/**
 * ScannedDeviceCard
 *
 * Displays a card for a scanned device with its name and icon
 * @param props - Device information and onPress handler
 * @returns JSX component
 */
const ScannedDeviceCard: React.FC<ScannedDeviceProps> = ({
  name,
  type,
  onPress,
}) => (
  <TouchableOpacity
    style={[globalStyles.deviceCard, { padding: 0 }]}
    onPress={onPress}
  >
    <Image
      source={deviceImages[`${type}-online`]}
      style={globalStyles.deviceIcon}
      resizeMode="contain"
    />
    <View style={globalStyles.deviceInfo}>
      <Text style={globalStyles.deviceName}>{name}</Text>
    </View>
  </TouchableOpacity>
);

/**
 * DeviceTypeCard
 *
 * Displays a card for a device type with its label and icon
 * @param props - Device type information and onPress handler
 * @returns JSX component
 */
const DeviceTypeCard: React.FC<DeviceTypeProps> = ({
  label,
  defaultIcon,
  disabled,
  onPress,
  style,
}) => (
  <TouchableOpacity
    style={[
      globalStyles.deviceCard,
      disabled && globalStyles.deviceCardDisabled,
      { padding: 0 },
      style,
    ]}
    onPress={onPress}
    disabled={disabled}
  >
    <View style={globalStyles.deviceIconContainer}>
      <Image
        source={deviceImages[`${defaultIcon}-online`]}
        style={globalStyles.deviceIcon}
        resizeMode="contain"
      />
    </View>
    <Text style={[globalStyles.deviceLabel, disabled && globalStyles.textGray]}>
      {label}
    </Text>
  </TouchableOpacity>
);

/**
 * ScanningAnimation
 *
 * Displays an animated loading indicator while scanning for devices
 * @returns JSX component
 */
const ScanningAnimation = () => {
  // Hooks
  const { t } = useTranslation();

  // State
  const [rotateAnim] = useState(new Animated.Value(0));

  // Effects
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // Render
  return (
    <View style={globalStyles.scanningContainer}>
      <Animated.View
        style={[globalStyles.scanningIcon, { transform: [{ rotate: spin }] }]}
      >
        <ActivityIndicator size="large" color={tokens.colors.primary} />
      </Animated.View>
      <Text style={globalStyles.scanningText}>
        {t("device.scan.ble.scanningDevices")}
      </Text>
    </View>
  );
};

/**
 * NoDevicesFound
 *
 * Displays a message when no devices are found with refresh icon to rescan
 * @param props - onScanAgain handler and optional style
 * @returns JSX component
 */
const NoDevicesFound = ({
  onScanAgain,
  style,
}: {
  onScanAgain: () => void;
  style?: any;
}) => {
  const { t } = useTranslation();
  return (
    <ContentWrapper
      title={t("device.scan.ble.noDevicesFound")}
      style={style}
      leftSlot={
        <TouchableOpacity onPress={onScanAgain} style={styles.rescanButton}>
          <RotateCcw size={20} color={tokens.colors.primary} />
        </TouchableOpacity>
      }
    >
      <View style={styles.emptyContainer} />
    </ContentWrapper>
  );
};

/**
 * Scan
 *
 * Main component for device scanning functionality
 * Handles BLE device discovery and connection
 * @returns JSX component
 */
const Scan = () => {
  // Hooks
  const toast = useToast();
  const { store } = useCDF();
  const router = useRouter();
  const { t } = useTranslation();

  // State
  const [isScanning, setIsScanning] = useState(false);
  const [connectingDevice, setConnectingDevice] = useState<
    Record<string, boolean>
  >({});
  const [scannedDevices, setScannedDevices] = useState<ESPDevice[]>([]);

  // Filter out disabled device types
  const availableDevices = DEVICE_TYPE_LIST.filter(
    (device) => !device.disabled
  );

  useEffect(() => {
    if (store.userStore.user) {
      handleBleDeviceScan();
    }
  }, []);

  /**
   * This function is used to scan for ble devices with the default prefix
   *
   * SDK function: ESPUser.searchESPDevices
   */
  const handleBleDeviceScan = async () => {
    setIsScanning(true);
    try {
      const deviceList = await store.userStore.user?.searchESPBLEDevices(1);
      if (deviceList) {
        setScannedDevices(deviceList as unknown as ESPDevice[]);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsScanning(false);
    }
  };

  /**
   * This function is used to connect to a ble device
   *
   * steps followed in this function:
   * 1. connect to the device
   * 2. get the device capabilities
   * 3. set the proof of possession
   * 4. initialize the session
   * 5. set the connected ble device
   * 6. navigate to the wifi screen
   *
   * Followinf functions are implemeted in ESPProvAdapter and native module :
   *
   * ESPDevice.connect,
   * ESPDevice.getDeviceCapabilities,
   * ESPDevice.setProofOfPossession,
   * ESPDevice.initializeSession,
   */
  const handleBleDeviceConnect = async (device: ESPDevice) => {
    setConnectingDevice((prev) => ({
      ...prev,
      [device.name]: true,
    }));

    try {
      // store the connected ble device for next screens
      store.nodeStore.connectedDevice = device;

      // connect to the device
      const response = await device.connect();
      // Check for successful connection (0 typically means success)
      if (response === 0) {
        // get the device capabilities
        const capabilities = await device.getDeviceCapabilities();
        // If device need pop then navigate to the pop screen
        if (
          !capabilities.includes("no_pop") ||
          !capabilities.includes("no_sec")
        ) {
          router.push({
            pathname: "/(device)/POP",
          });
          return;
        }
        // initialize the session
        await device.initializeSession();
        router.push({
          pathname: "/(device)/Wifi",
        });
        return;
      }
    } catch (error) {
      console.error("BLE connection error:", error);
      toast.showError(t("device.errors.connectionFailed"));
    } finally {
      setConnectingDevice((prev) => ({
        ...prev,
        [device.name]: false,
      }));
    }
  };

  // Render
  return (
    <>
      <Header
        label={t("device.scan.ble.title")}
        rightSlot={<Bluetooth size={24} color={tokens.colors.bluetooth} />}
      />
      <ScreenWrapper style={globalStyles.scanContainer}>
        {isScanning ? (
          <ContentWrapper
            title={t("device.scan.ble.scanningDevices")}
            style={globalStyles.shadowElevationForLightTheme}
          >
            <ScanningAnimation />
          </ContentWrapper>
        ) : (
          <>
            {scannedDevices.length > 0 ? (
              <ContentWrapper
                title={
                  connectingDevice
                    ? t("device.scan.ble.connectingDevice")
                    : t("device.scan.ble.devicesFound", {
                        count: scannedDevices.length,
                      })
                }
                style={globalStyles.shadowElevationForLightTheme}
              >
                <ScrollView style={globalStyles.scannedDevicesList}>
                  {scannedDevices.map((device, index) => (
                    <ScannedDeviceCard
                      key={index}
                      name={device.name}
                      type={"light-1"}
                      onPress={() => handleBleDeviceConnect(device)}
                    />
                  ))}
                </ScrollView>
              </ContentWrapper>
            ) : (
              <NoDevicesFound
                onScanAgain={handleBleDeviceScan}
                style={globalStyles.shadowElevationForLightTheme}
              />
            )}
          </>
        )}

        <Text style={globalStyles.sectionTitle}>
          {t("device.scan.ble.allDevices")}
        </Text>

        <ScrollView
          style={globalStyles.deviceListContainer}
          showsVerticalScrollIndicator={false}
        >
          {availableDevices.map((device, index) => (
            <DeviceTypeCard
              key={index}
              label={device.label}
              defaultIcon={device.defaultIcon}
              disabled={device.disabled}
              onPress={() => {}}
              style={globalStyles.shadowElevationForLightTheme}
            />
          ))}
        </ScrollView>
      </ScreenWrapper>
    </>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  rescanButton: {
    padding: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    height: 60,
  },
});

export default Scan;
