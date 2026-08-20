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

export interface UseConfigScanReturn {
  phase: ConfigScanPhase;
  showScanner: boolean;
  setShowScanner: (show: boolean) => void;
  permission: { granted: boolean } | null;
  requestPermission: () => void;
  /**
   * Resolves and applies a scanned config.
   * @returns `true` when accepted; `false` when invalid / failed (scanner shows
   * red border + Scan Again).
   */
  handleScan: (scannedValue: string) => Promise<boolean>;
  handleUpdateConfig: () => void;
  handleCancel: () => void;
  handleBackFromScanner: () => void;
  /** Display label (base URL) of the remembered deployment, else null. */
  savedDeploymentLabel: string | null;
  handleContinueWithSaved: () => Promise<void>;
}

/**
 * Hook for config scan flow: state and handlers.
 * Single responsibility: manage scan lifecycle.
 *
 * Applying a deployment rebuilds the SDK layer in place, falling back to a
 * process relaunch.
 *
 * Invalid or failed scans return `false` so the scanner can freeze, vibrate,
 * show a red border, and offer Scan Again (same pattern as provision ScanQR).
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
   * Rebuilds the SDK layer in place for the config just persisted, then routes to
   * auth. Falls back to a relaunch on failure — the config is already stored, so a
   * fresh process comes up on the right backend either way.
   *
   * Never throws: a rebuild failure is not a scan failure, so it must not surface
   * as one.
   */
  const applyDeploymentSwitch = useCallback(async () => {
    try {
      await reinitializeSdk();
      // Reset: ConfigScan is pushed from Landing / Login, and the deployment is
      // now committed, so nothing beneath it should stay reachable with back.
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
        // Resolve while the camera is still mounted so invalid payloads can
        // toast without flashing the loading screen.
        const json = await resolveConfigFromScan(scannedValue);

        setPhase("applying");
        await runtimeConfigManager.applyAndPersist(
          json.sdk,
          json.config as SDKConfig,
        );
        // Remember it so the user can come back to this deployment later
        // without re-scanning, even after switching to RainMaker Classic / RainMaker Neo.
        await runtimeConfigManager.rememberPrivateDeployment(
          json.sdk,
          json.config as SDKConfig,
        );
        await asyncStorageAdapter.clear();

        // Success view goes up before the rebuild: it is slower than a relaunch was.
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
        // Keep / restore the scanner so it can show red border + Scan Again.
        setPhase("info");
        scannedRef.current = false;
        return false;
      }
    },
    [applyDeploymentSwitch, t, toast],
  );

  /**
   * Opens the camera scanner (requests permission when needed).
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
    // `router.back()` is a silent no-op when there is nothing to pop (e.g. the
    // stack was reset by a programmatic restart, or this screen is the entry
    // route), which reads as a dead back button. Fall back to the pre-auth
    // route so the screen is always dismissible.
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

  const savedDeployment = runtimeConfigManager.privateDeployment;
  const savedDeploymentLabel = savedDeployment?.config?.baseUrl ?? null;

  /**
   * Continue with the previously configured private deployment instead of
   * scanning a new QR code. Re-applies it as the active runtime config and
   * rebuilds the SDK layer in place; when it is already the active backend no
   * re-init is needed and we go straight to auth.
   */
  const handleContinueWithSaved = useCallback(async () => {
    const saved = runtimeConfigManager.privateDeployment;
    if (!saved) return;
    // A second pass would tear the SDK layer down underneath the first.
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
      // Switching backends: wipe session data (runtime config + language keys
      // are protected in asyncStorageAdapter.clear()) and re-init the SDK layer.
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
