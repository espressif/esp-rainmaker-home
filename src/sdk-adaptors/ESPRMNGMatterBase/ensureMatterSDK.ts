/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPRMNGMatterBase } from "@espressif/rmng-matter-sdk";
import { getRMNGMatterSDKConfig } from "@config/sdk.config";
import { runtimeConfigManager } from "@config/runtime.config";
import { installRmngCrossClusterInvokePatch } from "./installCrossClusterInvokePatch";
import { initializeRmngMatterSubscription } from "./utils/initializeRmngMatterSubscription";
import { registerRmngMatterLocalDiscoveryHooks } from "./registerRmngMatterLocalDiscoveryHooks";

let configured = false;
let configurePromise: Promise<void> | null = null;

/** Idempotent RMNG Matter SDK configure (patches ESPRMNGUser.getGroups, fabric APIs). */
export async function ensureRmngMatterSdkConfigured(): Promise<void> {
  if (configured) return;
  if (!configurePromise) {
    configurePromise = (async () => {
      registerRmngMatterLocalDiscoveryHooks();
      await runtimeConfigManager.loadFromStorage();
      installRmngCrossClusterInvokePatch();
      ESPRMNGMatterBase.configure(getRMNGMatterSDKConfig());
      await initializeRmngMatterSubscription();
      configured = true;
    })();
  }
  try {
    await configurePromise;
  } catch (error) {
    configurePromise = null;
    throw error;
  }
}
