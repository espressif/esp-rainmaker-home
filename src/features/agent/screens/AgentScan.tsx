/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, TouchableOpacity } from "react-native";
import { CameraView } from "expo-camera";
import { useTranslation } from "react-i18next";
import { Header, ScreenWrapper } from "@shared/components";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { useAgentQrScan } from "@features/agent/hooks";

/**
 * Full-screen QR scanner for agent Settings; adds the scanned agent and returns to Settings.
 */
export function AgentScanScreen() {
  const { t } = useTranslation();
  const { permission, requestPermission, handleScan, handleBack } =
    useAgentQrScan();

  if (!permission?.granted) {
    return (
      <ScreenWrapper style={globalStyles.configScanNoPadding}>
        <Header
          label={t("aiSettings.scan.title")}
          showBack
          onBackPress={handleBack}
        />
        <View style={globalStyles.configScanCenterContent}>
          <Text style={globalStyles.configScanMessage}>
            {t("aiSettings.scan.cameraPermissionRequired")}
          </Text>
          <View style={globalStyles.configScanButtonRow}>
            <TouchableOpacity
              style={globalStyles.configScanButton}
              onPress={requestPermission}
            >
              <Text style={globalStyles.configScanButtonText}>
                {t("aiSettings.scan.grantPermission")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                globalStyles.configScanButton,
                globalStyles.configScanCancelButton,
              ]}
              onPress={handleBack}
            >
              <Text style={globalStyles.configScanButtonText}>
                {t("common.cancel")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper style={globalStyles.configScanContainerNoPadding}>
      <Header
        label={t("aiSettings.scan.title")}
        showBack
        onBackPress={handleBack}
      />
      <View
        style={[
          globalStyles.scannerContainer,
          globalStyles.configScanScannerView,
        ]}
      >
        <CameraView
          style={globalStyles.scanner}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => handleScan(data)}
        />
        <View style={globalStyles.configScanOverlay}>
          <Text style={globalStyles.configScanOverlayText}>
            {t("aiSettings.scan.alignQRCode")}
          </Text>
        </View>
      </View>
    </ScreenWrapper>
  );
}
