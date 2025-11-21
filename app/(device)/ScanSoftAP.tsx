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
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";

// Theme and Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// SDK
import { ESPDevice, ESPTransport } from "@espressif/rainmaker-base-sdk";

// Hooks
import { useCDF } from "@/hooks/useCDF";
import { useRouter } from "expo-router";

// Icons
import { HouseWifi, Check, RotateCcw } from "lucide-react-native";

// Components
import { Header, ScreenWrapper, ContentWrapper, Typo } from "@/components";
import ActionButton from "@/components/Form/ActionButton";

// Utils
import { testProps } from "@/utils/testProps";
import { deviceImages } from "@/utils/device";
import { useToast } from "@/hooks/useToast";

// Adapters
import { provisionAdapter } from "@/adaptors/implementations/ESPProvAdapter";

// Constants
import { PLATFORM_IOS } from "@/utils/constants";

// SoftAP Module
import { ESPSoftAPAdapter } from "@/adaptors/implementations/ESPSoftAPAdapter";

// Types
interface ScannedDeviceProps {
  name: string;
  type: string;
  onPress: () => void;
  isSelected: boolean;
}

/**
 * ScannedDeviceCard
 *
 * Displays a card for a scanned SoftAP device with its name, icon, and selection state
 * @param props - Device information, onPress handler, and selection state
 * @returns JSX component
 */
const ScannedDeviceCard: React.FC<ScannedDeviceProps> = ({
  name,
  type,
  onPress,
  isSelected,
}) => (
  <TouchableOpacity
    {...testProps("button_scanned_device_soft_ap")}
    style={[
      globalStyles.deviceCard,
      { padding: 0 },
      isSelected && styles.selectedDeviceCard,
    ]}
    onPress={onPress}
  >
    <View {...testProps("view_icon_container_device")} style={globalStyles.deviceIconContainer}>
      <Image
        {...testProps("image_icon_device")}
        source={deviceImages[`${type}-online`]}
        style={globalStyles.deviceIcon}
        resizeMode="contain"
      />
    </View>
    <View {...testProps("view_info_device")} style={globalStyles.deviceInfo}>
      <Text {...testProps("text_name_device")} style={globalStyles.deviceName}>{name}</Text>
    </View>
    {isSelected && (
      <View {...testProps("view_checkbox_scan_soft_ap")} style={styles.checkboxContainer}>
        <Check size={16} color={tokens.colors.white} />
      </View>
    )}
  </TouchableOpacity>
);

/**
 * ScanningAnimation
 *
 * Displays an animated loading indicator while scanning for SoftAP devices
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
    <View {...testProps("view_scanning_container")} style={globalStyles.scanningContainer}>
      <Animated.View
        {...testProps("view_scanning_icon")}
        style={[globalStyles.scanningIcon, { transform: [{ rotate: spin }] }]}
      >
        <ActivityIndicator size="large" color={tokens.colors.primary} />
      </Animated.View>
      <Text {...testProps("text_scanning_devices_soft_ap")} style={globalStyles.scanningText}>
        {t("device.scan.softAP.scanningDevices")}
      </Text>
    </View>
  );
};

/**
 * NoDevicesFound
 *
 * Displays a message when no SoftAP devices are found with option to scan again
 * @param props - onScanAgain handler
 * @returns JSX component
 */
const NoDevicesFound = ({ onScanAgain }: { onScanAgain: () => void }) => {
  const { t } = useTranslation();
  return (
    <ContentWrapper
      title={t("device.scan.softAP.noDevicesFound")}
      style={globalStyles.shadowElevationForLightTheme}
      leftSlot={
      <TouchableOpacity {...testProps("button_rescan_scan_soft_ap")} onPress={onScanAgain} style={styles.rescanButton}>
          <RotateCcw size={20} color={tokens.colors.primary} />
        </TouchableOpacity>
      }
      qaId="no_devices_found_scan_soft_ap"
    >
      <View style={styles.emptyContainer} />
    </ContentWrapper>
  );
};

/**
 * iOS Simple ScanSoftAP Component
 *
 * This component displays a simple SoftAP provisioning screen for iOS
 * where users are guided to connect their phone to the device's Wi-Fi network.
 */
const IOSScanSoftAP = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const { store } = useCDF();

  const handleConnect = async () => {
    try {
      // Check if already connected to SoftAP and get device info with capabilities
      const connectionResult = await ESPSoftAPAdapter.checkSoftAPConnection();

      if (connectionResult) {
        const { deviceName, capabilities } = connectionResult;
        toast.showSuccess(t("device.scan.softAP.deviceConnected"));
        // Check if device needs POP based on capabilities
        const needsPop =
          !capabilities.includes("no_pop") && !capabilities.includes("no_sec");

        if (needsPop) {
          // Store device info for POP screen (don't create ESP device yet)
          store.nodeStore.softAPDeviceInfo = {
            deviceName,
            capabilities,
            transport: "softap",
          };

          // Navigate to POP screen where device will be created after POP entry
          router.push({ pathname: "/(device)/POP" });
        } else {
          // No POP required, create ESP device and proceed
          const deviceInterface = await provisionAdapter.createESPDevice(
            deviceName,
            "softap", // transport type
            2, // security type (SECURITY_2)
            "", // proof of possession (empty since no POP needed)
            "", // softAP password
            "wifiprov" // username
          );

          if (deviceInterface) {
            // Create proper ESPDevice instance from interface
            const espDevice = new ESPDevice(deviceInterface);

            // Connect to the device directly
            const response = await espDevice.connect();

            if (response === 0) {
              // Store the connected device
              store.nodeStore.connectedDevice = espDevice;

              router.push({ pathname: "/(device)/Wifi" });
            } else {
              toast.showError(t("device.errors.connectionFailed"));
            }
          } else {
            toast.showError(t("device.errors.deviceCreationFailed"));
          }
        }
      } else {
        // Not connected to SoftAP, open WiFi settings
        await ESPSoftAPAdapter.openWifiSettings();
      }
    } catch (error) {
      console.error("Error in SoftAP connect:", error);
      toast.showError(t("device.errors.connectionFailed"));
    }
  };

  return (
    <>
      <Header label={t("device.scan.softAP.title")} qaId="header_scan_soft_ap" />
      <ScreenWrapper
        style={{
          ...globalStyles.container,
          backgroundColor: tokens.colors.bg5,
        }}
        qaId="screen_wrapper_scan_soft_ap"
      >
        {/* Instructions */}
        <View
          style={[
            globalStyles.emptyStateContainer,
            { backgroundColor: "transparent" },
          ]} {...testProps("view_scan_soft_ap")}
        >
          <View
            style={[
              globalStyles.emptyStateIconContainer,
              {
                backgroundColor: tokens.colors.white,
                padding: tokens.spacing._15,
              },
            ]} {...testProps("view_scan_soft_ap")}
          >
            <HouseWifi size={50} color={tokens.colors.primary} {...testProps("icon_house_wifi")}/>
          </View>
          <Typo variant="h2" style={globalStyles.instructionsText} qaId="typo_instruction_title">
            {t("device.scan.softAP.mainHeading")}
          </Typo>

          <Typo variant="body" style={globalStyles.instrctionDescription} qaId="typo_instruction_description">
            {t("device.scan.softAP.instructions")}
          </Typo>
        </View>

        {/* Connect Button */}
        <View style={globalStyles.footerAddButtonContainer} {...testProps("view_scan_soft_ap")}>
          <ActionButton
            variant="primary"
            onPress={handleConnect}
            style={globalStyles.footerAddButton}
            qaId="button_connect_scan_soft_ap"
          >
            <Typo variant="body" style={globalStyles.buttonTextPrimary} qaId="typo_connect">
              {t("device.scan.softAP.connectButton")}
            </Typo>
          </ActionButton>
        </View>
      </ScreenWrapper>
    </>
  );
};

/**
 * Android Advanced ScanSoftAP Component
 *
 * This component displays the SoftAP provisioning screen for Android where users
 * can scan for and select SoftAP devices for provisioning.
 * The screen shows discovered devices with selection capability and
 * handles the connection flow to POP or WiFi screens.
 */
const AndroidScanSoftAP = () => {
  // Hooks
  const toast = useToast();
  const { store } = useCDF();
  const router = useRouter();
  const { t } = useTranslation();

  // State
  const [isScanning, setIsScanning] = useState(false);
  const [connectingDevice, setConnectingDevice] = useState(false);
  const [scannedDevices, setScannedDevices] = useState<ESPDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<ESPDevice | null>(null);
  const [devicePrefix] = useState<string>("PROV_");

  // Effects
  useEffect(() => {
    if (store.userStore.user) {
      handleSoftAPDeviceScan();
    }
  }, []);

  /**
   * This function is used to scan for SoftAP devices with the default prefix
   *
   * SDK function: provisionAdapter.searchESPDevices
   */
  const handleSoftAPDeviceScan = async () => {
    setIsScanning(true);
    setSelectedDevice(null);
    try {
      const deviceList = await store.userStore.user?.searchESPDevices(
        devicePrefix,
        ESPTransport.softap
      );
      if (deviceList) {
        setScannedDevices(deviceList);
      }
    } catch (error) {
      console.error("Error scanning SoftAP devices:", error);
    } finally {
      setIsScanning(false);
    }
  };

  /**
   * This function is used to connect to a SoftAP device
   *
   * steps followed in this function:
   * 1. connect to the device
   * 2. get the device capabilities
   * 3. set the proof of possession if required
   * 4. initialize the session
   * 5. set the connected SoftAP device
   * 6. navigate to the appropriate screen (POP or WiFi)
   */
  const handleSoftAPDeviceConnect = async () => {
    if (!selectedDevice) {
      toast.showError(t("device.errors.noDeviceSelected"));
      return;
    }

    setConnectingDevice(true);
    try {
      // Connect to the device
      const response = await selectedDevice.connect();
      // Check for successful connection
      if (response === 0) {
        // Get the device capabilities
        const deviceCapabilities = await selectedDevice.getDeviceCapabilities();

        // Store the connected SoftAP device for next screens
        store.nodeStore.connectedDevice = selectedDevice;

        // Check if device requires POP (Proof of Possession)
        if (
          !deviceCapabilities.includes("no_pop") ||
          !deviceCapabilities.includes("no_sec")
        ) {
          // Navigate to POP screen
          router.push({
            pathname: "/(device)/POP",
            params: { deviceName: selectedDevice.name },
          });
        } else if (deviceCapabilities.includes("wifi_scan")) {
          // Initialize session and navigate to WiFi screen
          const isSessionInitialized = await selectedDevice.initializeSession();

          if (isSessionInitialized) {
            router.push({
              pathname: "/(device)/Wifi",
            });
          } else {
            toast.showError(t("device.errors.sessionInitFailed"));
          }
        } else {
          // Initialize session and navigate to WiFi screen
          const isSessionInitialized = await selectedDevice.initializeSession();

          if (isSessionInitialized) {
            router.push({
              pathname: "/(device)/Wifi",
            });
          } else {
            toast.showError(t("device.errors.sessionInitFailed"));
          }
        }
        return;
      } else {
        console.warn("Connection failed with status:", response);
        toast.showError(t("device.errors.connectionFailed"));
      }
    } catch (error) {
      console.error("Error connecting to SoftAP device:", error);
      toast.showError(t("device.errors.connectionFailed"));
    } finally {
      setConnectingDevice(false);
    }
  };

  /**
   * Handle device selection
   */
  const handleDeviceSelect = (device: ESPDevice) => {
    setSelectedDevice(device);
  };

  // Render
  return (
    <>
      <Header
        label={t("device.scan.softAP.title")}
        rightSlot={<HouseWifi {...testProps("icon_house_wifi")} size={24} color={tokens.colors.primary} />}
        qaId="header_scan_soft_ap"
      />
      <ScreenWrapper style={{ ...globalStyles.scanContainer }} qaId="screen_wrapper_scan_soft_ap">
        {isScanning ? (
          <ContentWrapper
            title={t("device.scan.softAP.scanningDevices")}
            style={globalStyles.shadowElevationForLightTheme}
            qaId="scanning_devices_scan_soft_ap"
          >
            <ScanningAnimation />
          </ContentWrapper>
        ) : (
          <>
            {scannedDevices.length > 0 ? (
              <ContentWrapper
                title={
                  connectingDevice
                    ? t("device.scan.softAP.connectingDevice")
                    : t("device.scan.softAP.devicesFound", {
                        count: scannedDevices.length,
                      })
                }
                style={globalStyles.shadowElevationForLightTheme}
                qaId="devices_found_scan_soft_ap"
              >
                <ScrollView {...testProps("scroll_scan_soft_ap")} style={globalStyles.scannedDevicesList}>
                  {scannedDevices.map((device, index) => (
                    <ScannedDeviceCard
                      key={index}
                      name={device.name}
                      type={"light-1"}
                      onPress={() => handleDeviceSelect(device)}
                      isSelected={selectedDevice?.name === device.name}
                    />
                  ))}
                </ScrollView>
              </ContentWrapper>
            ) : (
              <NoDevicesFound onScanAgain={handleSoftAPDeviceScan} />
            )}
          </>
        )}

        {/* Connect Button - Only enabled when a device is selected */}
        <View style={globalStyles.footerAddButtonContainer} {...testProps("view_scan_soft_ap")}>
          <ActionButton
            variant="primary"
            onPress={handleSoftAPDeviceConnect}
            style={globalStyles.footerAddButton}
            disabled={!selectedDevice || connectingDevice}
            qaId="button_connect_scan_soft_ap"
          >
            {connectingDevice ? (
              <ActivityIndicator size="small" color={tokens.colors.white} />
            ) : (
              <Typo variant="body" style={globalStyles.buttonTextPrimary} qaId="typo_connect">
                {t("device.scan.softAP.connectButton")}
              </Typo>
            )}
          </ActionButton>
        </View>
      </ScreenWrapper>
    </>
  );
};

/**
 * ScanSoftAP Component
 *
 * Platform-specific component that renders different UIs based on the platform:
 * - iOS: Simple instructional screen
 * - Android: Full-featured device scanning and selection
 */
const ScanSoftAP = () => {
  return Platform.OS === PLATFORM_IOS ? (
    <IOSScanSoftAP />
  ) : (
    <AndroidScanSoftAP />
  );
};

const styles = StyleSheet.create({
  selectedDeviceCard: {
    borderColor: tokens.colors.primary,
    borderWidth: 2,
  },
  checkboxContainer: {
    backgroundColor: tokens.colors.primary,
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: tokens.spacing._10,
  },
  rescanButton: {
    padding: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    height: 60,
  },
});

export default ScanSoftAP;
