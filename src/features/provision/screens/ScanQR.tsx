/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { globalStyles } from "@shared/theme/globalStyleSheet";
import { Header, ScreenWrapper, QrCameraScanner } from "@shared/components";
import { getMissingPermission } from "@shared/utils/device";
import { testProps } from "@shared/utils/testProps";
import { useScanQR } from "@features/provision/hooks";
import {
  BLEPermissionScreen,
  BluetoothDisabledScreen,
  CameraPermissionScreen,
  ScanQRFlipCameraControl,
  ScanQRFooter,
} from "@features/provision/components";
import {
  PERMISSION_UI_STATUS_DENIED,
  PERMISSION_UI_STATUS_REQUESTING,
} from "@features/provision/constants";

/**
 * ScanQR
 *
 * Thin screen composer for QR-based device provisioning: permission / BLE gates,
 * shared camera scanner, and provision footer actions.
 * @returns QR scan screen
 */
const ScanQR = () => {
  const { t } = useTranslation();
  const {
    permission,
    bleGranted,
    locationGranted,
    bluetoothEnabled,
    isCheckingBluetooth,
    allPermissionsGranted,
    scanned,
    cameraType,
    isProcessing,
    detectedQrBounds,
    showScanAgain,
    scanFailed,
    isScreenFocused,
    remountKey,
    cameraRef,
    scannerGatesOpen,
    navigateWithoutQr,
    handleRequestCameraPermission,
    toggleCamera,
    handleScanAgain,
    handleScannedQRCode,
    onOverlaySizeChange,
  } = useScanQR();

  return (
    <ScreenWrapper
      style={{ ...globalStyles.screenWrapper, padding: 0 }}
      qaId="screen_wrapper_scan_qr"
    >
      <Header label={t("device.scan.qr.title")} qaId="header_scan_qr" />

      <View
        {...testProps("view_scan_qr_container")}
        style={globalStyles.scanQrContainer}
      >
        <View
          {...testProps("view_scan_qr_content")}
          style={globalStyles.scanQrContent}
        >
          {!permission ? (
            <CameraPermissionScreen
              status={PERMISSION_UI_STATUS_REQUESTING}
              onRequestPermission={handleRequestCameraPermission}
              onContinueWithoutQr={navigateWithoutQr}
            />
          ) : !permission.granted ? (
            <CameraPermissionScreen
              status={PERMISSION_UI_STATUS_DENIED}
              onRequestPermission={handleRequestCameraPermission}
              onContinueWithoutQr={navigateWithoutQr}
            />
          ) : !allPermissionsGranted ? (
            <BLEPermissionScreen
              status={
                isCheckingBluetooth
                  ? PERMISSION_UI_STATUS_REQUESTING
                  : PERMISSION_UI_STATUS_DENIED
              }
              missingPermission={getMissingPermission(
                bleGranted,
                locationGranted,
              )}
              testIdPrefix="scan_qr"
            />
          ) : bluetoothEnabled === false && !isCheckingBluetooth ? (
            <BluetoothDisabledScreen />
          ) : (
            <QrCameraScanner
              ref={cameraRef}
              enabled={isScreenFocused && scannerGatesOpen}
              remountKey={remountKey}
              scanningEnabled={!isProcessing && !scanned && !showScanAgain}
              facing={cameraType}
              scanned={scanned}
              hasFailed={scanFailed}
              detectedBounds={detectedQrBounds}
              hintText={t("device.scan.qr.alignQRCode")}
              onBarcodeScanned={handleScannedQRCode}
              onOverlaySizeChange={onOverlaySizeChange}
              topAccessory={
                !scanned && !showScanAgain ? (
                  <ScanQRFlipCameraControl onToggle={toggleCamera} />
                ) : null
              }
            />
          )}
        </View>

        {permission?.granted ? (
          <ScanQRFooter
            showScanAgain={showScanAgain}
            isConnecting={scanned || isProcessing}
            onScanAgain={handleScanAgain}
            onContinueWithoutQr={navigateWithoutQr}
          />
        ) : null}
      </View>
    </ScreenWrapper>
  );
};

export default ScanQR;
