/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useContext, useRef, useCallback } from "react";
import { useRouter } from "expo-router";
import { runtimeConfigManager } from "@config/runtime.config";
import type { SDKConfig } from "@config/runtime.config";
import asyncStorageAdapter from "@native-adaptors/implementations/ESPAsyncStorage";
import { AppRestartContext } from "@context/appRestart.context";
import { resolveConfigFromScan } from "@features/config/utils/configScan";
import { getPreAuthRoute } from "@features/landing/utils/currentDeployment";
import { resetStackTo } from "@shared/utils/navigation";
import type { ConfigScanPhase } from "@src/types/global";
import type { UseConfigScanBaseReturn } from "./useConfigScan.types";

/**
 * Shared config-scan apply lifecycle (no camera).
 * Native and web wrappers add input (camera vs paste/upload) on top.
 * @returns Scan phase, errors, and handlers used by both platforms
 */
export function useConfigScanShared(): UseConfigScanBaseReturn {
  const router = useRouter();
  const { restartApp, reinitializeSdk } = useContext(AppRestartContext);

  const [phase, setPhase] = useState<ConfigScanPhase>("info");
  const [errorMessage, setErrorMessage] = useState("");
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
   * Validates a scanned / pasted payload, persists it, and switches deployment.
   * @param scannedValue - JSON string, client-outputs JSON, or http(s) config URL
   */
  const handleScan = useCallback(
    async (scannedValue: string) => {
      if (scannedRef.current) return;
      scannedRef.current = true;
      setPhase("fetching");

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
      } catch (e) {
        setPhase("error");
        setErrorMessage(e instanceof Error ? e.message : String(e));
        scannedRef.current = false;
      }
    },
    [applyDeploymentSwitch],
  );

  /**
   * Returns to the input step after a failed apply.
   */
  const handleRetry = useCallback(() => {
    setPhase("scanning");
    setErrorMessage("");
    scannedRef.current = false;
  }, []);

  /**
   * Opens the platform input (camera on native, paste/upload on web).
   */
  const handleUpdateConfig = useCallback(() => {
    setShowScanner(true);
  }, []);

  /**
   * Leaves config scan: pop if possible, otherwise the pre-auth route.
   */
  const handleCancel = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(getPreAuthRoute() as never);
  }, [router]);

  /**
   * Closes the input step and returns to the info view.
   */
  const handleBackFromScanner = useCallback(() => {
    setShowScanner(false);
    setPhase("info");
    setErrorMessage("");
    scannedRef.current = false;
  }, []);

  const savedDeployment = runtimeConfigManager.privateDeployment;
  const savedDeploymentLabel = savedDeployment?.config?.baseUrl ?? null;

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
    errorMessage,
    showScanner,
    setShowScanner,
    handleScan,
    handleRetry,
    handleUpdateConfig,
    handleCancel,
    handleBackFromScanner,
    savedDeploymentLabel,
    handleContinueWithSaved,
  };
}
