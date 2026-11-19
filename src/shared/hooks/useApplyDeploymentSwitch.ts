/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useContext } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";

import { AppRestartContext } from "@context/appRestart.context";
import { reloadWebAfterDeploymentChange } from "@shared/utils/webDeploymentReload";
import { resetStackTo } from "@shared/utils/navigation";
import {
  AUTH_LOGIN_SCREEN_ROUTE,
  PLATFORM_WEB,
} from "@shared/utils/constants";

/** Default console prefix when callers do not supply one. */
const DEFAULT_LOG_PREFIX = "[DeploymentSwitch]";

export interface UseApplyDeploymentSwitchOptions {
  /**
   * Prefix for the failure `console.error` so Landing / ConfigScan logs stay
   * distinguishable without forking the switch logic.
   */
  logPrefix?: string;
}

export interface UseApplyDeploymentSwitchReturn {
  /**
   * Rebuilds the SDK layer in place for the config just persisted, then routes
   * to Login. On web, reloads the page instead. On native failure, reloads the
   * JS runtime; the config is already saved.
   */
  applyDeploymentSwitch: () => Promise<void>;
}

/**
 * Shared post-persist deployment switch used by Landing and Config Scan.
 *
 * Web cannot tear down the SDK in place, so it reloads after the config is
 * saved. Native tries `reinitializeSdk` then resets the stack to Login; any
 * failure falls back to a full JS reload via `restartApp`.
 *
 * @param options - Optional log prefix for failure diagnostics
 * @returns Callback that applies the in-place (or web reload) switch
 */
export function useApplyDeploymentSwitch(
  options?: UseApplyDeploymentSwitchOptions,
): UseApplyDeploymentSwitchReturn {
  const router = useRouter();
  const { restartApp, reinitializeSdk } = useContext(AppRestartContext);
  const logPrefix = options?.logPrefix ?? DEFAULT_LOG_PREFIX;

  const applyDeploymentSwitch = useCallback(async () => {
    if (Platform.OS === PLATFORM_WEB) {
      reloadWebAfterDeploymentChange();
      return;
    }
    try {
      await reinitializeSdk();
      // Reset, not replace: deployment screens are often pushed on top of Login
      // ("Change deployment"), so replacing only swaps the top entry for a
      // second Login. Cycling through deployments would stack one more each
      // time, and back would walk the user through all of them.
      resetStackTo(router, AUTH_LOGIN_SCREEN_ROUTE);
    } catch (error) {
      console.error(
        `${logPrefix} In-place SDK switch failed, reloading JS:`,
        error,
      );
      restartApp();
    }
  }, [router, restartApp, reinitializeSdk, logPrefix]);

  return { applyDeploymentSwitch };
}
