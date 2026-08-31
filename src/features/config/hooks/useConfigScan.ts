/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useContext, useRef, useCallback } from "react";
import { useRouter } from "expo-router";
import { useCameraPermissions } from "expo-camera";
import { useTranslation } from "react-i18next";
import { runtimeConfigManager } from "@config/runtime.config";
import type { SDKConfig } from "@config/runtime.config";
import asyncStorageAdapter from "@native-adaptors/implementations/ESPAsyncStorage";
import { AppRestartContext } from "@context/appRestart.context";
import { CONFIG_SCAN_INVALID_PAYLOAD_ERROR } from "@features/config/constants";
import { resolveConfigFromScan } from "@features/config/utils/configScan";
import { getPreAuthRoute } from "@features/landing/utils/currentDeployment";
import { useToast } from "@shared/hooks/useToast";
import { resetStackTo } from "@shared/utils/navigation";
import type { ConfigScanPhase } from "@src/types/global";
import type { UseConfigScanReturn } from "./useConfigScan.types";

export type { UseConfigScanReturn } from "./useConfigScan.types";

/**
 * Native config-scan hook: camera permission plus scan lifecycle.
 * Web builds resolve `useConfigScan.web.ts` instead.
 *
 * Invalid or failed scans return `false` from {@link handleScan} so the scanner
 * can freeze, vibrate, show a red border, and offer Scan Again.
 * @returns Scan phase, camera permission, and handlers
 */
export function useConfigScan(): UseConfigScanReturn {
  const router = useRouter();
  const { t } = useTranslation();
  const toast = useToast();
  const { restartApp, reinitializeSdk } = useContext(AppRestartContext);
  const [permission, requestPermission] = useCameraPermissions();

  const [phase, setPhase] = useState<ConfigScanPhase>("info");
  const [showScanner, setShowScanner] = useState(false);
  const scannedRef = useRef(false);
  const switchingRef = useRef(false);

  /**
   * Rebuilds the SDK layer in place for the config just persisted, then routes
   * to auth. Falls back to a relaunch on failure — the config is already stored.
   */
  const applyDeploymentSwitch = useCallback(async () => {
    try {
      await reinitializeSdk();
      resetStackTo(router, "/(auth)/Login");
    } catch (error) {
      console.error(
        "[ConfigScan] In-place SDK switch failed, relaunching:",
        error,
      );
      restartApp();
    }
  }, [router, reinitializeSdk, restartApp]);

  /**
   * Resolves and applies a scanned config. On failure, toasts and returns
   * `false` so the scanner can keep the frozen frame with failure UI.
   * @param scannedValue - Raw QR payload (JSON or http(s) URL)
   * @returns Whether the scan was accepted
   */
  const handleScan = useCallback(
    async (scannedValue: string): Promise<boolean> => {
      if (scannedRef.current) return false;
      scannedRef.current = true;

      try {
        const json = await resolveConfigFromScan(scannedValue);

        setPhase("applying");
        await runtimeConfigManager.applyAndPersist(
          json.sdk,
          json.config as SDKConfig,
        );
        await runtimeConfigManager.rememberPrivateDeployment(
          json.sdk,
          json.config as SDKConfig,
        );
        await asyncStorageAdapter.clear();

        setPhase("success");
        await applyDeploymentSwitch();
        return true;
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        toast.showError(
          raw === CONFIG_SCAN_INVALID_PAYLOAD_ERROR || !raw
            ? t("config.scan.invalidQRCode")
            : raw,
        );
        setPhase("info");
        scannedRef.current = false;
        return false;
      }
    },
    [applyDeploymentSwitch, t, toast],
  );

  /**
   * Opens the camera scanner, requesting permission when it is not granted.
   */
  const handleUpdateConfig = useCallback(() => {
    if (!permission?.granted) {
      requestPermission();
    }
    setShowScanner(true);
  }, [permission?.granted, requestPermission]);

  /**
   * Dismisses Config Scan back to the previous route, or the pre-auth entry.
   */
  const handleCancel = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(getPreAuthRoute() as never);
  }, [router]);

  /**
   * Leaves the scanner and clears scan locks so the next open starts clean.
   */
  const handleBackFromScanner = useCallback(() => {
    setShowScanner(false);
    setPhase("info");
    scannedRef.current = false;
  }, []);

  const savedDeploymentLabel =
    runtimeConfigManager.privateDeployment?.config?.baseUrl ?? null;

  /**
   * Re-applies the remembered private deployment without a new scan.
   */
  const handleContinueWithSaved = useCallback(async () => {
    const saved = runtimeConfigManager.privateDeployment;
    if (!saved) return;
    if (switchingRef.current) return;

    const isAlreadyActive =
      runtimeConfigManager.activeSdk === saved.sdk &&
      runtimeConfigManager.config?.baseUrl === saved.config.baseUrl;

    await runtimeConfigManager.applyAndPersist(saved.sdk, saved.config);

    if (isAlreadyActive) {
      resetStackTo(router, "/(auth)/Login");
      return;
    }

    switchingRef.current = true;
    try {
      await asyncStorageAdapter.clear();
      await applyDeploymentSwitch();
    } finally {
      switchingRef.current = false;
    }
  }, [router, applyDeploymentSwitch]);

  return {
    phase,
    showScanner,
    setShowScanner,
    permission,
    requestPermission,
    handleScan,
    handleUpdateConfig,
    handleCancel,
    handleBackFromScanner,
    savedDeploymentLabel,
    handleContinueWithSaved,
  };
}
