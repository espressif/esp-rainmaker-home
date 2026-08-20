/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTranslation } from "react-i18next";
import {
  ConfigScanInfoView,
  ConfigScanPermissionView,
  ConfigScanLoadingView,
  ConfigScanSuccessView,
  ConfigScanScannerView,
} from "@features/config/components";
import { useConfigScan } from "@features/config/hooks";

/**
 * Renders the config scan screen UI section.
 *
 * Invalid QR payloads stay on the scanner with toast, freeze, red border, and
 * Scan Again (same pattern as provision ScanQR).
 */
export function ConfigScanScreen() {
  const { t } = useTranslation();
  const title = t("config.scan.title");

  const {
    phase,
    showScanner,
    permission,
    requestPermission,
    handleScan,
    handleUpdateConfig,
    handleCancel,
    handleBackFromScanner,
    savedDeploymentLabel,
    handleContinueWithSaved,
  } = useConfigScan();

  if (!showScanner) {
    return (
      <ConfigScanInfoView
        title={title}
        onUpdateConfig={handleUpdateConfig}
        onCancel={handleCancel}
        savedDeploymentLabel={savedDeploymentLabel}
        onContinueWithSaved={handleContinueWithSaved}
      />
    );
  }

  if (!permission?.granted) {
    return (
      <ConfigScanPermissionView
        title={title}
        onGrant={requestPermission}
        onBack={handleBackFromScanner}
      />
    );
  }

  if (phase === "applying") {
    return (
      <ConfigScanLoadingView
        title={title}
        message={t("config.scan.applying")}
        onCancel={handleCancel}
      />
    );
  }

  if (phase === "success") {
    return <ConfigScanSuccessView />;
  }

  return (
    <ConfigScanScannerView
      title={title}
      onScan={handleScan}
      onBack={handleBackFromScanner}
    />
  );
}
