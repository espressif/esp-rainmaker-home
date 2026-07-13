/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";

// Hooks
import { useScanBLE } from "@features/provision/hooks";
import { getMissingPermission, getProvisionBleIconName } from "@shared/utils/device";

// Icons
import { Bluetooth, RotateCcw } from "lucide-react-native";

// Components
import { Header, ScreenWrapper, ContentWrapper } from "@shared/components";
import { AgentTermsBottomSheet } from "@features/agent/components";
import {
  BLEPermissionScreen,
  BluetoothDisabledScreen,
  ScannedDeviceCard,
  DeviceTypeCard,
  ScanningAnimation,
  NoDevicesFound,
} from "@features/provision/components";

// Utils
import { testProps } from "@shared/utils/testProps";

/**
 * ScanBLE
 *
 * Main component for device scanning functionality
 * Handles BLE device discovery and connection
 * @returns Screen that switches between permission, scan list, loading, and empty states
 */
const ScanBLE = () => {
  const { t } = useTranslation();
  const {
    // State
    isScanning,
    scannedDevices,
    connectingDevice,
    showAgentTerms,
    devicePrefix,
    availableDevices,

    // Permissions
    bluetoothEnabled,
    isChecking,
    allPermissionsGranted,
    bleGranted,
    locationGranted,

    // Handlers
    handleScanAgain,
    handleBleDeviceConnect,
    handleAgentTermsComplete,
    handleAgentTermsClose,
  } = useScanBLE();

  // Show Bluetooth disabled screen if Bluetooth is off
  if (allPermissionsGranted && bluetoothEnabled === false && !isChecking) {
    return (
      <>
        <Header
          label={t("device.scan.ble.title")}
          rightSlot={
            <Bluetooth
              {...testProps("icon_bluetooth_scan_ble")}
              size={24}
              color={tokens.colors.bluetooth}
            />
          }
          qaId="header_scan_ble"
        />
        <ScreenWrapper
          style={globalStyles.scanContainer}
          qaId="screen_wrapper_scan_ble"
        >
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
          rightSlot={
            <Bluetooth
              {...testProps("icon_bluetooth_scan_ble")}
              size={24}
              color={tokens.colors.bluetooth}
            />
          }
          qaId="header_scan_ble"
        />
        <ScreenWrapper
          style={globalStyles.scanContainer}
          qaId="screen_wrapper_scan_ble"
        >
          <BLEPermissionScreen
            status={isChecking ? "requesting" : "denied"}
            missingPermission={getMissingPermission(
              bleGranted,
              locationGranted,
            )}
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
        rightSlot={
          <Bluetooth
            {...testProps("icon_bluetooth_scan_ble")}
            size={24}
            color={tokens.colors.bluetooth}
          />
        }
        qaId="header_scan_ble"
      />
      <ScreenWrapper
        style={globalStyles.scanContainer}
        qaId="screen_wrapper_scan_ble"
      >
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
                  Object.keys(connectingDevice).length > 0
                    ? t("device.scan.ble.connectingDevice")
                    : t("device.scan.ble.devicesFound", {
                        count: scannedDevices.length,
                      })
                }
                style={globalStyles.shadowElevationForLightTheme}
                leftSlot={
                  <TouchableOpacity
                    {...testProps("button_rescan_ble")}
                    onPress={handleScanAgain}
                    style={styles.rescanButton}
                  >
                    <RotateCcw size={20} color={tokens.colors.primary} />
                  </TouchableOpacity>
                }
                qaId="devices_found_scan_ble"
              >
                <ScrollView
                  {...testProps("scroll_scan_ble")}
                  style={globalStyles.scannedDevicesList}
                >
                  {scannedDevices.map((device, index) => (
                    <ScannedDeviceCard
                      key={index}
                      name={device.name}
                      type={getProvisionBleIconName(device.advertisementData)}
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

        <Text
          {...testProps("text_all_devices_title")}
          style={globalStyles.sectionTitle}
        >
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

      {/* Agent Terms Bottom Sheet - shown when AI Agent device is clicked by new user */}
      <AgentTermsBottomSheet
        visible={showAgentTerms}
        onClose={handleAgentTermsClose}
        onComplete={handleAgentTermsComplete}
      />
    </>
  );
};

const styles = StyleSheet.create({
  rescanButton: {
    padding: 4,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default ScanBLE;
