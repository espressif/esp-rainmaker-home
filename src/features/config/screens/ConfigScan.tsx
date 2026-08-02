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
  ConfigScanErrorView,
  ConfigScanScannerView,
} from "@features/config/components";
import { useConfigScan } from "@features/config/hooks";

/**
 * Renders the config scan screen UI section.
 */
export function ConfigScanScreen() {
  const { t } = useTranslation();
  const title = t("config.scan.title");

  const {
    phase,
    errorMessage,
    showScanner,
    permission,
    requestPermission,
    handleScan,
    handleRetry,
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

  if (phase === "fetching" || phase === "applying") {
    const message =
      phase === "fetching"
        ? t("config.scan.fetching")
        : t("config.scan.applying");
    return (
      <ConfigScanLoadingView
        title={title}
        message={message}
        onCancel={handleCancel}
      />
    );
  }

  if (phase === "success") {
    return <ConfigScanSuccessView />;
  }

  if (phase === "error") {
    return (
      <ConfigScanErrorView
        title={title}
        errorMessage={errorMessage}
        onRetry={handleRetry}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <ConfigScanScannerView
      title={title}
      onScan={handleScan}
      onBack={handleBackFromScanner}
    />
  );
}
