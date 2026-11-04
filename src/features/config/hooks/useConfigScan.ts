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
import { UnreadableStyleError, syncSaved } from "@shared/runtimeStyle/store";
import { resetStackTo } from "@shared/utils/navigation";
import type { ConfigScanPhase } from "@src/types/global";
import type { UseConfigScanReturn } from "./useConfigScan.types";
import { useDeploymentTrust } from "./useDeploymentTrust";

export type { UseConfigScanReturn } from "./useConfigScan.types";

/** Brand error toast duration; the switch waits this long so it does not clear the toast. */
const BRAND_TOAST_MS = 3000;

/** Result of syncing the chosen deployment's brand. */
interface BrandOutcome {
  /** The saved brand differs from the one on screen and needs a JS reload to show. */
  changed: boolean;
  /** The deployment has a brand file this app cannot read. */
  unreadable: boolean;
}

/**
 * Fetches and saves the chosen deployment's brand.json. A failed fetch does not throw: it
 * keeps the saved brand when the URL is the active deployment's, otherwise (or when the
 * file is unreadable) it clears the saved brand.
 * @param brandUrl - The chosen deployment's brand.json URL, if any
 * @returns Whether the brand changed, and whether the brand file was unreadable
 */
async function applyChosenBrand(brandUrl: string | undefined): Promise<BrandOutcome> {
  try {
    return { changed: await syncSaved(brandUrl), unreadable: false };
  } catch (error) {
    console.warn("[ConfigScan] Could not fetch the deployment's brand:", error);
    // An unreadable brand file (e.g. unsupported schemaVersion) also clears the saved brand.
    const unreadable = error instanceof UnreadableStyleError;
    const keepSaved = !unreadable && !!brandUrl && brandUrl === runtimeConfigManager.config?.brandUrl;
    return { changed: keepSaved ? false : await syncSaved(), unreadable };
  }
}

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
  const { trustPrompt, askTrust, confirmTrust, cancelTrust } = useDeploymentTrust();

  /**
   * Rebuilds the SDK layer in place for the config just persisted, then routes
   * to auth. On failure it reloads the JS runtime; the config is already saved.
   */
  const applyDeploymentSwitch = useCallback(async () => {
    try {
      await reinitializeSdk();
      resetStackTo(router, "/(auth)/Login");
    } catch (error) {
      console.error(
        "[ConfigScan] In-place SDK switch failed, reloading JS:",
        error,
      );
      restartApp();
    }
  }, [router, reinitializeSdk, restartApp]);

  /**
   * Shows an error toast and waits when the brand file was unreadable, or reloads
   * the JS runtime when the brand changed so theme tokens are rebuilt.
   * @param brand - Result of syncing the chosen deployment's brand
   * @returns Whether the JS runtime is reloading
   */
  const reportBrand = useCallback(
    async (brand: BrandOutcome): Promise<boolean> => {
      if (brand.unreadable) {
        toast.showError(t("config.scan.brandNotApplied"), undefined, {
          duration: BRAND_TOAST_MS,
        });
        await new Promise((resolve) => setTimeout(resolve, BRAND_TOAST_MS));
        return false;
      }
      if (brand.changed) {
        restartApp();
        return true;
      }
      return false;
    },
    [restartApp, t, toast],
  );

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

        // The screen shows the trust dialog only in the "fetching" phase.
        // Nothing is saved unless the user trusts the deployment.
        setPhase("fetching");
        if (!(await askTrust(json.sdk, json.config as SDKConfig))) {
          setShowScanner(false);
          setPhase("info");
          scannedRef.current = false;
          return true;
        }

        setPhase("applying");
        // Saves brand.json now; its images are cached at the next launch.
        const brand = await applyChosenBrand(json.config.brandUrl);
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
        if (await reportBrand(brand)) {
          return true;
        }
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
    [applyDeploymentSwitch, askTrust, reportBrand, t, toast],
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

    switchingRef.current = true;
    try {
      const isAlreadyActive =
        runtimeConfigManager.activeSdk === saved.sdk &&
        runtimeConfigManager.config?.baseUrl === saved.config.baseUrl;

      const brand = await applyChosenBrand(saved.config.brandUrl);
      await runtimeConfigManager.applyAndPersist(saved.sdk, saved.config);
      if (await reportBrand(brand)) {
        return;
      }

      if (isAlreadyActive) {
        resetStackTo(router, "/(auth)/Login");
        return;
      }

      await asyncStorageAdapter.clear();
      await applyDeploymentSwitch();
    } finally {
      switchingRef.current = false;
    }
  }, [router, applyDeploymentSwitch, reportBrand]);

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
    trustPrompt,
    confirmTrust,
    cancelTrust,
  };
}
