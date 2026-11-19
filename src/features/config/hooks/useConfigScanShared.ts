/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { runtimeConfigManager } from "@config/runtime.config";
import type { SDKConfig } from "@config/runtime.config";
import asyncStorageAdapter from "@native-adaptors/implementations/ESPAsyncStorage";
import { resolveConfigFromScan } from "@features/config/utils/configScan";
import { getPreAuthRoute } from "@features/landing/utils/currentDeployment";
import { useApplyDeploymentSwitch } from "@shared/hooks/useApplyDeploymentSwitch";
import { fetchBrandDocumentForUrl } from "@shared/runtimeStyle/fetchPublishedBrand";
import { replaceCurrentUrlWithBrandDocument } from "@shared/runtimeStyle/webBrandParam";
import { useToast } from "@shared/hooks/useToast";
import { resetStackTo } from "@shared/utils/navigation";
import { AUTH_LOGIN_SCREEN_ROUTE, PLATFORM_WEB } from "@shared/utils/constants";
import type { ConfigScanPhase } from "@src/types/global";
import type { UseConfigScanBaseReturn } from "./useConfigScan.types";
import { useDeploymentTrust } from "./useDeploymentTrust";

/**
 * Shared config-scan apply lifecycle (no camera).
 * Native and web wrappers add input (camera vs paste/upload) on top.
 * @returns Scan phase, errors, and handlers used by both platforms
 */
export function useConfigScanShared(): UseConfigScanBaseReturn {
  const router = useRouter();
  const { t } = useTranslation();
  const toast = useToast();
  const { applyDeploymentSwitch } = useApplyDeploymentSwitch({
    logPrefix: "[ConfigScan]",
  });

  const [phase, setPhase] = useState<ConfigScanPhase>("info");
  const [errorMessage, setErrorMessage] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const scannedRef = useRef(false);
  const switchingRef = useRef(false);
  const { trustPrompt, askTrust, confirmTrust, cancelTrust } = useDeploymentTrust();

  /**
   * On web, fetches brand.json and navigates to `#brand=<base64url(JSON)>` so theme loads at startup.
   * @param brandUrl - Deployment brand.json URL from scanned config
   * @returns True when the page is reloading with the brand hash
   */
  const applyWebBrandUrl = useCallback(
    async (brandUrl: string | undefined): Promise<boolean> => {
      if (Platform.OS !== PLATFORM_WEB || !brandUrl) return false;
      const { document, unreadable } = await fetchBrandDocumentForUrl(brandUrl);
      if (unreadable) {
        toast.showError(t("config.scan.brandNotApplied"));
        return false;
      }
      if (!document) return false;
      replaceCurrentUrlWithBrandDocument(document);
      return true;
    },
    [t, toast],
  );

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

        // Nothing is saved unless the user trusts the deployment.
        if (!(await askTrust(json.sdk, json.config as SDKConfig))) {
          setShowScanner(false);
          setPhase("info");
          scannedRef.current = false;
          return;
        }

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
        if (await applyWebBrandUrl(json.config.brandUrl)) {
          return;
        }
        await applyDeploymentSwitch();
      } catch (e) {
        setPhase("error");
        setErrorMessage(e instanceof Error ? e.message : String(e));
        scannedRef.current = false;
      }
    },
    [applyDeploymentSwitch, applyWebBrandUrl, askTrust],
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
      resetStackTo(router, AUTH_LOGIN_SCREEN_ROUTE);
      return;
    }

    switchingRef.current = true;
    try {
      await asyncStorageAdapter.clear();
      if (await applyWebBrandUrl(saved.config.brandUrl)) {
        return;
      }
      await applyDeploymentSwitch();
    } finally {
      switchingRef.current = false;
    }
  }, [router, applyDeploymentSwitch, applyWebBrandUrl]);

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
    trustPrompt,
    confirmTrust,
    cancelTrust,
  };
}
