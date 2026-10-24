/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useContext } from "react";
import { useRouter } from "expo-router";

import {
  runtimeConfigManager,
  type SDKConfig,
} from "@config/runtime.config";
import { getResolvedActiveSdk } from "@config/sdk.config";
import {
  ESPRMMatter_BASE_SDK_ID,
  ESPRMNeoMatter_BASE_SDK_ID,
  type SDKIdentifier,
} from "@config/sdk.identifiers";
import { getRegionConfig } from "@config/region.config";
import asyncStorageAdapter from "@native-adaptors/implementations/ESPAsyncStorage";
import { AppRestartContext } from "@context/appRestart.context";
import { syncSaved } from "@shared/runtimeStyle/store";
import { resetStackTo } from "@shared/utils/navigation";

import type { PlatformKind, PlatformOption } from "../config/platformOptions";

export interface UseLandingReturn {
  /** Handle a tap on a Landing option card. */
  selectPlatform: (option: PlatformOption) => Promise<void>;
}

/**
 * Resolves the built-in {SDK id, cloud config} for a RainMaker Classic / RainMaker Neo selection
 * from the active region's committed config. RainMaker Classic maps to the Matter-capable
 * RainMaker stack, RainMaker Neo to the Matter-capable RainMaker Neo stack (mirrors the region defaults and
 * the scan-config normalization).
 */
function resolveBuiltInSelection(kind: "classic" | "neo"): {
  sdk: SDKIdentifier;
  config: SDKConfig;
} {
  const region = getRegionConfig();
  return kind === "neo"
    ? { sdk: ESPRMNeoMatter_BASE_SDK_ID, config: region.rmneoSdk as SDKConfig }
    : { sdk: ESPRMMatter_BASE_SDK_ID, config: region.rmSdk as SDKConfig };
}

/**
 * Key-order-insensitive serialization, so two configs carrying the same values
 * compare equal however they were built — read from the region env, or
 * round-tripped through storage as a scanned config.
 */
function stableConfigKey(config: SDKConfig | null): string {
  return JSON.stringify(config, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  );
}

/**
 * Whether the SDK layer is already running on this exact cloud config.
 *
 * The SDK id alone is not enough: a scanned private deployment runs on the same
 * `rainmaker-neo-base-sdk` id as the built-in RainMaker Neo selection, so matching on id would skip
 * the restart and leave the SDK initialised against the scanned deployment.
 *
 * `runtimeConfigManager.config` is null until a selection or scan overrides the
 * build, in which case the region default is what is effectively active.
 */
function isConfigAlreadyActive(
  kind: "classic" | "neo",
  config: SDKConfig,
): boolean {
  const active =
    runtimeConfigManager.config ?? resolveBuiltInSelection(kind).config;
  return stableConfigKey(active) === stableConfigKey(config);
}

/**
 * Landing screen behaviour: pick a backend platform.
 *
 * - `ownDeployment` → open the QR Config Scan flow (custom deployment).
 * - `classic` / `neo` → persist the built-in SDK + region cloud config and
 *   restart so the SDK layer re-initialises. If that backend and config are
 *   already active, skip the restart and go straight to auth.
 *
 * Choosing a built-in backend clears any saved brand; if that changes the style,
 * the JS runtime reloads so theme tokens are rebuilt.
 */
export function useLanding(): UseLandingReturn {
  const router = useRouter();
  const { restartApp, reinitializeSdk } = useContext(AppRestartContext);

  /**
   * Rebuilds the SDK layer in place for the config just persisted, then routes
   * to auth. On failure it reloads the JS runtime; the config is already saved.
   */
  const applyDeploymentSwitch = useCallback(async () => {
    try {
      await reinitializeSdk();
      // Reset, not replace: this screen is usually reached by pushing Landing
      // on top of Login ("Change deployment"), so replacing only swaps
      // Landing for a second Login. Cycling through deployments would stack
      // one more each time, and back would walk the user through all of them.
      resetStackTo(router, "/(auth)/Login");
    } catch (error) {
      console.error("[Landing] In-place SDK switch failed, reloading JS:", error);
      restartApp();
    }
  }, [router, restartApp, reinitializeSdk]);

  /**
   * Goes back when there is a screen below (usually Login), otherwise replaces
   * this screen with Login.
   */
  const goToAuth = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      // `replace`, not `push`: Landing is the root here (first launch), and
      // the choice was just persisted so Landing is skipped from now on.
      // Pushing would strand it under Login — and then under Home, since
      // login replaces only the top entry.
      router.replace("/(auth)/Login");
    }
  }, [router]);

  const selectPlatform = useCallback(
    async (option: PlatformOption) => {
      const kind: PlatformKind = option.kind;

      if (kind === "ownDeployment") {
        // Same flow the hidden 5-tap logo gesture opens.
        router.push("/(config)/ConfigScan" as never);
        return;
      }

      const { sdk, config } = resolveBuiltInSelection(kind);
      const alreadyActive =
        getResolvedActiveSdk() === sdk && isConfigAlreadyActive(kind, config);

      // Already on the requested backend and config: persist the choice so
      // Landing is skipped on every later launch (it is the persisted selection,
      // not the build default, that marks Landing as passed), then route to
      // Login — no re-init/restart needed since the SDK is already active. If
      // Landing was pushed (from the Login deployment banner), pop back instead.
      if (alreadyActive) {
        await runtimeConfigManager.applyAndPersist(sdk, config);
        // Clears any saved brand; reloads the JS runtime if that changes the style.
        try {
          if (await syncSaved()) {
            restartApp();
            return;
          }
        } catch (error: unknown) {
          console.warn("[Landing] Could not drop the saved brand:", error);
        }
        goToAuth();
        return;
      }

      await runtimeConfigManager.applyAndPersist(sdk, config);
      // Wipe session data; runtime config + language keys are protected in
      // asyncStorageAdapter.clear(), so the selection just made survives.
      await asyncStorageAdapter.clear();

      // Clears any saved brand. Theme tokens are built at JS load, so a change
      // reloads the JS runtime.
      try {
        if (await syncSaved()) {
          restartApp();
          return;
        }
      } catch (error: unknown) {
        console.warn("[Landing] Could not drop the saved brand:", error);
      }

      await applyDeploymentSwitch();
    },
    [router, restartApp, applyDeploymentSwitch, goToAuth],
  );

  return { selectPlatform };
}
