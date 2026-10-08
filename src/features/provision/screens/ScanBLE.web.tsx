/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActivityIndicator, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { Bluetooth } from "lucide-react-native";
import {
  Header,
  ScreenWrapper,
  ContentWrapper,
  ActionButton,
} from "@shared/components";
import { AgentTermsBottomSheet } from "@features/agent/components";
import {
  BLEPermissionScreen,
  BluetoothDisabledScreen,
  ScanningAnimation,
} from "@features/provision/components";
import { useScanBLE } from "@features/provision/hooks";
import { getMissingPermission } from "@shared/utils/device";
import { flattenStyle } from "@shared/utils/flattenStyle";
import { testProps } from "@shared/utils/testProps";

/**
 * Web BLE provisioning screen.
 * Opens the browser device picker and connects immediately without a device list.
 * Web Bluetooth requires a user gesture, so the primary CTA starts the picker.
 * @returns Scan BLE screen for web desktop and mobile web.
 */
const ScanBLE = () => {
  const { t } = useTranslation();
  const {
    isScanning,
    connectingDevice,
    showAgentTerms,
    bluetoothEnabled,
    isChecking,
    allPermissionsGranted,
    bleGranted,
    locationGranted,
    handleScanAgain,
    handleAgentTermsComplete,
    handleAgentTermsClose,
  } = useScanBLE();

  const isConnecting = Object.keys(connectingDevice).length > 0;
  const isBusy = isScanning || isConnecting;
  const busyMessage = isConnecting
    ? t("device.scan.ble.connectingDevice")
    : t("device.scan.ble.scanningDevices");
  const header = (
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
  );

  if (allPermissionsGranted && bluetoothEnabled === false && !isChecking) {
    return (
      <>
        {header}
        <ScreenWrapper
          style={globalStyles.scanContainer}
          qaId="screen_wrapper_scan_ble"
        >
          <BluetoothDisabledScreen />
        </ScreenWrapper>
      </>
    );
  }

  if (!allPermissionsGranted || isChecking) {
    return (
      <>
        {header}
        <ScreenWrapper
          style={globalStyles.scanContainer}
          qaId="screen_wrapper_scan_ble"
        >
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
      {header}
      <ScreenWrapper
        style={globalStyles.scanContainer}
        qaId="screen_wrapper_scan_ble"
      >
        <ContentWrapper
          title={isBusy ? busyMessage : t("device.scan.ble.title")}
          style={globalStyles.shadowElevationForLightTheme}
          qaId="web_ble_connect_scan_ble"
        >
          {isBusy ? (
            <ScanningAnimation message={busyMessage} />
          ) : (
            <Text
              style={flattenStyle([
                globalStyles.textSecondary,
                globalStyles.textCenter,
                { marginBottom: tokens.spacing._20 },
              ])}
            >
              {t("device.scan.ble.webSelectDeviceHint")}
            </Text>
          )}
          <ActionButton
            onPress={handleScanAgain}
            variant="primary"
            disabled={isBusy}
            style={{ marginBottom: tokens.spacing._15 }}
            qaId="button_connect_ble_device_web"
          >
            {isBusy ? (
              <ActivityIndicator
                {...testProps("activity_indicator_connect_ble_device_web")}
                size="small"
                color={tokens.colors.white}
              />
            ) : (
              <Text
                style={flattenStyle([
                  globalStyles.fontMedium,
                  globalStyles.textWhite,
                ])}
              >
                {t("device.scan.ble.webConnectDevice")}
              </Text>
            )}
          </ActionButton>
        </ContentWrapper>
      </ScreenWrapper>

      <AgentTermsBottomSheet
        visible={showAgentTerms}
        onClose={handleAgentTermsClose}
        onComplete={handleAgentTermsComplete}
      />
    </>
  );
};

export default ScanBLE;
