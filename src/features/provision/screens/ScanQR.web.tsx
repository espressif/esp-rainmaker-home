/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { QrCode } from "lucide-react-native";

import { Header, ScreenWrapper, ActionButton } from "@shared/components";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import { flattenStyle } from "@shared/utils/flattenStyle";
import { testProps } from "@shared/utils/testProps";
import { getMissingPermission } from "@shared/utils/device";
import {
  BLEPermissionScreen,
  BluetoothDisabledScreen,
  ScanningAnimation,
} from "@features/provision/components";
import { ScanQRInputView } from "@features/provision/components/ScanQRInputView.web";
import { useScanQR } from "@features/provision/hooks/useScanQR.web";
import {
  PERMISSION_UI_STATUS_DENIED,
  PERMISSION_UI_STATUS_REQUESTING,
} from "@features/provision/constants";
import { scanQRWebStyles } from "@features/provision/theme/scanQRWebStyles";

/**
 * Web ScanQR: upload/paste a device QR, then Connect (user gesture) for Web Bluetooth.
 * @returns Provision QR screen for web
 */
const ScanQR = () => {
  const { t } = useTranslation();
  const {
    phase,
    pendingDeviceName,
    isProcessing,
    bleGranted,
    locationGranted,
    bluetoothEnabled,
    isCheckingBluetooth,
    allPermissionsGranted,
    navigateWithoutQr,
    handleParsedQrPayload,
    handleConnect,
    handleScanAgain,
  } = useScanQR();

  const header = (
    <Header label={t("device.scan.qr.title")} qaId="header_scan_qr" />
  );

  if (!allPermissionsGranted || isCheckingBluetooth) {
    return (
      <>
        {header}
        <ScreenWrapper
          style={globalStyles.scanContainer}
          qaId="screen_wrapper_scan_qr"
        >
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
        </ScreenWrapper>
      </>
    );
  }

  if (bluetoothEnabled === false && !isCheckingBluetooth) {
    return (
      <>
        {header}
        <ScreenWrapper
          style={globalStyles.scanContainer}
          qaId="screen_wrapper_scan_qr"
        >
          <BluetoothDisabledScreen />
        </ScreenWrapper>
      </>
    );
  }

  const showReady = phase === "ready" || phase === "connecting";
  const showFailed = phase === "failed";
  const isBusy = phase === "connecting" || isProcessing;

  return (
    <ScreenWrapper style={scanQRWebStyles.screen} qaId="screen_wrapper_scan_qr">
      {header}
      <View
        {...testProps("view_scan_qr_container")}
        style={scanQRWebStyles.screen}
      >
        {showReady ? (
          <View
            {...testProps("view_scan_qr_ready")}
            style={scanQRWebStyles.scrollContent}
          >
            <View style={scanQRWebStyles.readyCard}>
              <Text style={scanQRWebStyles.readyTitle}>
                {t("device.scan.qr.deviceReadyTitle")}
              </Text>
              <Text
                {...testProps("text_scan_qr_device_name")}
                style={scanQRWebStyles.readyDeviceName}
              >
                {pendingDeviceName}
              </Text>
              <Text style={scanQRWebStyles.readyHint}>
                {isBusy
                  ? t("device.scan.qr.connectingToDevice")
                  : t("device.scan.qr.webConnectHint")}
              </Text>
              {isBusy ? (
                <ScanningAnimation
                  message={t("device.scan.qr.connectingToDevice")}
                />
              ) : (
                <ActionButton
                  onPress={() => {
                    void handleConnect();
                  }}
                  variant="primary"
                  style={scanQRWebStyles.primaryButton}
                  qaId="button_connect_qr_device_web"
                >
                  <Text
                    style={flattenStyle([
                      globalStyles.fontMedium,
                      globalStyles.textWhite,
                    ])}
                  >
                    {t("device.scan.qr.webConnectDevice")}
                  </Text>
                </ActionButton>
              )}
            </View>
            {!isBusy ? (
              <TouchableOpacity
                {...testProps("button_rescan")}
                style={[
                  scanQRWebStyles.noQrButton,
                  { marginTop: tokens.spacing._15 },
                ]}
                onPress={handleScanAgain}
              >
                <QrCode
                  size={20}
                  color={tokens.colors.primary}
                  style={globalStyles.buttonIcon}
                />
                <Text style={scanQRWebStyles.noQrButtonText}>
                  {t("device.scan.qr.scanAgain")}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <>
            <ScanQRInputView
              onScan={handleParsedQrPayload}
              enabled={!isBusy}
            />
            <View style={scanQRWebStyles.footerRow}>
              {showFailed ? (
                <TouchableOpacity
                  {...testProps("button_rescan")}
                  style={scanQRWebStyles.noQrButton}
                  onPress={handleScanAgain}
                >
                  <QrCode
                    size={20}
                    color={tokens.colors.primary}
                    style={globalStyles.buttonIcon}
                  />
                  <Text
                    {...testProps("text_scan_again")}
                    style={scanQRWebStyles.noQrButtonText}
                  >
                    {t("device.scan.qr.scanAgain")}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  {...testProps("button_no_qr_code")}
                  style={scanQRWebStyles.noQrButton}
                  onPress={navigateWithoutQr}
                >
                  <Text
                    {...testProps("text_no_qr_code")}
                    style={scanQRWebStyles.noQrButtonText}
                  >
                    {t("device.scan.qr.noQrCode")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </View>
    </ScreenWrapper>
  );
};

export default ScanQR;
