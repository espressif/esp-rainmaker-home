/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTranslation } from "react-i18next";
import {
  ConfigScanInfoView,
  ConfigScanLoadingView,
  ConfigScanSuccessView,
  ConfigScanErrorView,
} from "@features/config/components";
import { ConfigScanInputView } from "@features/config/components/ConfigScanInputView.web";
import { useConfigScan } from "@features/config/hooks/useConfigScan.web";

/**
 * Web config screen: same apply flow as native, with paste/upload instead of camera.
 * @returns Info, input, loading, success, or error step
 */
export function ConfigScanScreen() {
  const { t } = useTranslation();
  const title = t("config.scan.title");

  const {
    phase,
    errorMessage,
    showScanner,
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
    <ConfigScanInputView
      title={title}
      onScan={handleScan}
      onBack={handleBackFromScanner}
    />
  );
}
