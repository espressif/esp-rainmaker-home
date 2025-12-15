/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Animated,
  ActivityIndicator,
  AppState,
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
import { useDevicePermissions } from "@/hooks/useDevicePermissions";

// Icons
import { Bluetooth, RotateCcw, CircleAlert } from "lucide-react-native";

// Components
import { Header, ScreenWrapper, ContentWrapper, BluetoothDisabledScreen, BLEPermissionScreen } from "@/components";

// Utils
import { testProps } from "@/utils/testProps";
import { deviceImages, getBleScanErrorType, getMissingPermission } from "@/utils/device";
import { useToast } from "@/hooks/useToast";
import { parseRMakerCapabilities } from "@/utils/rmakerCapabilities";
import ESPAppUtilityAdapter from "@/adaptors/implementations/ESPAppUtilityAdapter";

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
    {...testProps("button_scanned_device_ble")}
    style={[globalStyles.deviceCard, { padding: 0 }]}
    onPress={onPress}
  >
    <Image
      {...testProps("image_icon_device")}
      source={deviceImages[`${type}-online`]}
      style={globalStyles.deviceIcon}
      resizeMode="contain"
    />
    <View {...testProps("view_info_device")} style={globalStyles.deviceInfo}>
      <Text {...testProps("text_device_name")} style={globalStyles.deviceName}>{name}</Text>
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
    {...testProps(`button_device_type_${label}`)}
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
        {...testProps(`image_device_type_${label}`)}
        source={deviceImages[`${defaultIcon}-online`]}
        style={globalStyles.deviceIcon}
        resizeMode="contain"
      />
    </View>
    <Text {...testProps("text_label")} style={[globalStyles.deviceLabel, disabled && globalStyles.textGray]}>
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
    <View {...testProps("view_scan_ble")} style={globalStyles.scanningContainer}>
      <Animated.View
        {...testProps("view_animated")}
        style={[globalStyles.scanningIcon, { transform: [{ rotate: spin }] }]}
      >
        <ActivityIndicator size="large" color={tokens.colors.primary} />
      </Animated.View>
      <Text {...testProps("text_scanning_devices_ble")} style={globalStyles.scanningText}>
        {t("device.scan.ble.scanningDevices")}
      </Text>
    </View>
  );
};


/**
 * NoDevicesFound
 *
 * Displays a message when no devices are found with refresh icon to rescan
 * @param props - onScanAgain handler, device prefix, and optional style
 * @returns JSX component
 */
const NoDevicesFound = ({
  onScanAgain,
  devicePrefix,
  style,
}: {
  onScanAgain: () => void;
  devicePrefix?: string;
  style?: any;
}) => {
  const { t } = useTranslation();
  const prefix = devicePrefix;

  return (
    <ContentWrapper
      title={t("device.scan.ble.noDevicesFound")}
      style={style}
      leftSlot={
        <TouchableOpacity {...testProps("button_rescan")} onPress={onScanAgain} style={styles.rescanButton}>
          <RotateCcw size={20} color={tokens.colors.primary} />
        </TouchableOpacity>
      }
      qaId="no_devices_found_scan_ble"
    >
      <View style={styles.emptyContainer}>
        <View style={styles.noDeviceContent}>
          <View style={styles.noDeviceIconContainer}>
            <CircleAlert size={48} color={tokens.colors.primary} />
          </View>
          <Text
            {...testProps("text_no_device_message")}
            style={[globalStyles.textGray, styles.noDeviceMessage]}
          >
            {t("device.scan.ble.noDeviceMessage")}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Text
                {...testProps("text_prefix_value")}
                style={[globalStyles.fontMd, globalStyles.textPrimary, styles.prefixValue]}
              >
                {prefix}
              </Text>
            </View>
          </Text>
        </View>
      </View>
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
  const [devicePrefix] = useState<string>("PROV_");
  const {
    bleGranted,
    locationGranted,
    bluetoothEnabled,
    isChecking,
    allPermissionsGranted,
    requestPermissions,
    checkPermissions,
  } = useDevicePermissions();

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


  // Re-check permissions when app comes to foreground (user might have granted in settings)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        // Re-check permissions when app becomes active
        checkPermissions();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [checkPermissions]);

  /**
   * Handle scan again - reset state, disconnect device if connected, and trigger new scan
   */
  const handleScanAgain = () => {
    setIsScanning(false);
    setScannedDevices([]);
    setConnectingDevice({});

    const device = store.nodeStore.connectedDevice;
    if (device) {
      device.disconnect();
      store.nodeStore.connectedDevice = null;
    }
    
    hasAttemptedScanRef.current = false;
    handleBleDeviceScan();
  };

  /**
   * Utility function to handle BLE scan errors
   * Uses a switch statement to categorize and handle different error types
   *
   * @param errorMessage - The error message to analyze
   * @param errorCode - Optional error code from React Native rejection
   */
  const handleBleScanError = useCallback(
    (errorMessage: string, errorCode?: string) => {
      const errorType = getBleScanErrorType(errorMessage, errorCode);

      // Handle error based on type using switch statement
      switch (errorType) {
        case "permission": {
          // Request permissions
          ESPAppUtilityAdapter.requestAllPermissions();
          toast.showError(
            t("device.scan.ble.blePermissionRequired")
          );
          // Re-check permissions after a delay to allow permission dialog to be handled
          setTimeout(() => {
            checkPermissions();
          }, 2000);
          break;
        }

        case "bluetoothDisabled": {
          // Bluetooth is disabled - UI will show BluetoothDisabledScreen automatically
          // Just show a toast for additional feedback
          toast.showError(
            t("device.scan.ble.bluetoothDisabled")
          );
          break;
        }

        case "noDevices": {
          // No devices found - UI will show NoDevicesFound screen automatically
          // No toast needed as the screen already shows the message
          break;
        }

        case "scanFailed": {
          // BLE scanning failed error
          toast.showError(
            t("device.scan.ble.scanFailed")
          );
          break;
        }

        case "generic":
        default: {
          // Generic error - show a fallback message
          toast.showError(
            t("device.scan.ble.scanFailed")
          );
          break;
        }
      }
    },
    [t, toast, checkPermissions]
  );

  /**
   * This function is used to scan for ble devices with the default prefix
   *
   * SDK function: ESPUser.searchESPDevices
   * Default prefix: "PROV_"
   */
  const handleBleDeviceScan = useCallback(async () => {
    // Prevent multiple simultaneous scans
    if (isScanning) {
      return;
    }

    // Safety checks: Re-check permissions and transport status from native
    // This ensures we have the most up-to-date information before every scan
    await checkPermissions();

    // Safety checks: Verify all required permissions are granted
    // The UI will automatically show PermissionScreen if permissions are missing
    if (!allPermissionsGranted) {
      // Request permissions if not granted
      ESPAppUtilityAdapter.requestAllPermissions();
      return;
    }

    // Safety checks: Verify Bluetooth transport is enabled
    // The UI will automatically show BluetoothDisabledScreen if Bluetooth is disabled
    if (bluetoothEnabled === false) {
      return;
    }

    // All safety checks passed - proceed with scan
    setIsScanning(true);

    try {
      const deviceList = await store.userStore.user?.searchESPBLEDevices(1);
      if (deviceList && deviceList.length > 0) {
        setScannedDevices(deviceList as unknown as ESPDevice[]);
        setIsScanning(false);
      } else {
        // No devices found - stop scanning and show no devices screen
        setIsScanning(false);
        setScannedDevices([]);
      }
    } catch (error: any) {
      console.error("[BLE Scan] Error:", error);
      const errorMessage = error?.message || String(error);
      const errorCode = error?.code || error?.name;

      // Stop scanning immediately on error
      setIsScanning(false);
      setScannedDevices([]);

      // Use utility function to handle error (pass both message and code)
      handleBleScanError(errorMessage, errorCode);
    }
  }, [
    isScanning,
    store.userStore.user,
    toast,
    t,
    handleBleScanError,
    checkPermissions,
    allPermissionsGranted,
    bluetoothEnabled,
  ]);

  // Track if we've attempted a scan to prevent infinite retries
  const hasAttemptedScanRef = useRef(false);

  useEffect(() => {
    // Only scan if permissions are granted and Bluetooth is enabled
    // Don't scan if already scanning, if we have devices, or if we've already attempted a scan
    if (
      allPermissionsGranted &&
      bluetoothEnabled &&
      store.userStore.user &&
      !isScanning &&
      scannedDevices.length === 0 &&
      !hasAttemptedScanRef.current
    ) {
      hasAttemptedScanRef.current = true;
      handleBleDeviceScan();
    }
  }, [
    allPermissionsGranted,
    bluetoothEnabled,
    store.userStore.user,
    handleBleDeviceScan,
    isScanning,
    scannedDevices.length,
  ]);

  // Re-check Bluetooth state periodically when it's disabled
  useEffect(() => {
    if (allPermissionsGranted && bluetoothEnabled === false) {
      const interval = setInterval(() => {
        checkPermissions();
      }, 2000); // Check every 2 seconds
      return () => clearInterval(interval);
    }
  }, [allPermissionsGranted, bluetoothEnabled, checkPermissions]);

  // Reset state and disconnect device when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      // Reset scan state
      setIsScanning(false);
      setScannedDevices([]);
      setConnectingDevice({});

      // Disconnect device if connected
      const device = store.nodeStore.connectedDevice;
      if (device) {
        try {
          device.disconnect();
          store.nodeStore.connectedDevice = null;
        } catch (error) {
          console.error("[BLE Scan] Error disconnecting device:", error);
        }
      }

      // Don't automatically trigger scan - let the useEffect handle it
      // This prevents infinite loops
    }, [store])
  );

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
        // Fetch version info and prov capabilities
        const versionInfo = await device.getDeviceVersionInfo();
        const provCapabilities = await device.getDeviceCapabilities();

        // Parse RMaker capabilities from version info
        const rmakerCaps = parseRMakerCapabilities(
          versionInfo,
          provCapabilities
        );

        // If device needs POP then navigate to the POP screen
        if (rmakerCaps.requiresPop) {
          router.push({
            pathname: "/(device)/POP",
            params: {
              hasClaimCap: rmakerCaps.hasClaim ? "true" : "false",
            },
          });
          return;
        }

        // initialize the session
        await device.initializeSession();

        // If device supports claiming, navigate to Claiming screen
        if (rmakerCaps.hasClaim) {
          router.push({
            pathname: "/(device)/Claiming",
          });
          return;
        }

        // Otherwise go directly to WiFi
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
  // Show Bluetooth disabled screen if Bluetooth is off
  if (allPermissionsGranted && bluetoothEnabled === false && !isChecking) {
    return (
      <>
        <Header
          label={t("device.scan.ble.title")}
          rightSlot={<Bluetooth {...testProps("icon_bluetooth_scan_ble")} size={24} color={tokens.colors.bluetooth} />}
          qaId="header_scan_ble"
        />
        <ScreenWrapper style={globalStyles.scanContainer} qaId="screen_wrapper_scan_ble">
          <BluetoothDisabledScreen />
        </ScreenWrapper>
      </>
    );
  }

  // Show permission screen if permissions are not granted or checking
  if (!allPermissionsGranted || isChecking) {
    return (
      <>
        <Header
          label={t("device.scan.ble.title")}
          rightSlot={<Bluetooth {...testProps("icon_bluetooth_scan_ble")} size={24} color={tokens.colors.bluetooth} />}
          qaId="header_scan_ble"
        />
        <ScreenWrapper style={globalStyles.scanContainer} qaId="screen_wrapper_scan_ble">
          <BLEPermissionScreen
            status={isChecking ? "requesting" : "denied"}
            missingPermission={getMissingPermission(bleGranted, locationGranted)}
            testIdPrefix="scan_ble"
          />
        </ScreenWrapper>
      </>
    );
  }

  return (
    <>
      <Header
        label={t("device.scan.ble.title")}
        rightSlot={<Bluetooth {...testProps("icon_bluetooth_scan_ble")} size={24} color={tokens.colors.bluetooth} />}
        qaId="header_scan_ble"
      />
      <ScreenWrapper style={globalStyles.scanContainer} qaId="screen_wrapper_scan_ble">
        {isScanning ? (
          <ContentWrapper
            title={t("device.scan.ble.scanningDevices")}
            style={globalStyles.shadowElevationForLightTheme}
            qaId="scanning_devices_scan_ble"
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
                style={globalStyles.shadowElevationForLightTheme} qaId="devices_found_scan_ble"
              >
                <ScrollView {...testProps("scroll_scan_ble")} style={globalStyles.scannedDevicesList}>
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
                onScanAgain={handleScanAgain}
                devicePrefix={devicePrefix}
                style={globalStyles.shadowElevationForLightTheme}
              />
            )}
          </>
        )}

        <Text {...testProps("text_all_devices_title")} style={globalStyles.sectionTitle}>
          {t("device.scan.ble.allDevices")}
        </Text>

        <ScrollView
          {...testProps("scroll_scan_ble")}
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
    minHeight: 200,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: tokens.spacing._20,
  },
  noDeviceContent: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  noDeviceIconContainer: {
    marginBottom: tokens.spacing._20,
    padding: tokens.spacing._15,
    borderRadius: 50,
    backgroundColor: tokens.colors.bg4,
  },
  noDeviceMessage: {
    marginBottom: tokens.spacing._15,
    textAlign: "center",
    paddingHorizontal: tokens.spacing._20,
  },
  prefixValue: {
    fontWeight: "600",
    fontFamily: "monospace",
  },
  buttonIcon: {
    marginRight: tokens.spacing._10,
  },
});

export default Scan;
