/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPRMNGBase } from "@espressif/rmng-base-sdk";
import { ESPRMNGMatterBase, MatterSubscriptionChannelIds } from "@espressif/rmng-matter-sdk";
import { ensureRmngMatterInChannelOrder } from "../transformers/matterChannelOrder";

let initialized = false;

const MATTER_CHANNEL_ID = MatterSubscriptionChannelIds.MATTER;

/** True when the Matter channel is currently registered on the RMNG subscription manager. */
function isRmngMatterChannelRegistered(): boolean {
  const mgr = (
    ESPRMNGBase as unknown as {
      subscriptionManager?: { getRegisteredChannels?: () => string[] };
    }
  ).subscriptionManager;
  return mgr?.getRegisteredChannels?.().includes(MATTER_CHANNEL_ID) ?? false;
}

/** Registers RMNG Matter subscription channel with ESPRMNGBase.subscriptionManager. */
export async function initializeRmngMatterSubscription(): Promise<void> {
  if (!ESPRMNGMatterBase.getMatterSubscriptionChannel?.()) {
    return;
  }

  // Register the Matter channel only when it is actually missing.
  // - Calling initializeMatterSubscription() unconditionally on every sync
  //   tears the channel down and re-registers it, opening a window where every
  //   node's effective order is [matter] with no usable channel AND resetting
  //   in-flight CHIP operational discovery (slow/variable WLAN).
  // - But something outside this module unregisters the channel mid-session
  //   (SDK/native re-init, e.g. HeadlessJS commissioning), so we MUST
  //   re-register when it is gone or it stays lost for the rest of the session
  //   (that regression is exactly what made devices stay offline). Hence:
  //   idempotent when healthy, self-healing when torn down.
  if (isRmngMatterChannelRegistered()) {
    initialized = true;
    await ensureRmngMatterInChannelOrder();
    return;
  }

  try {
    await ESPRMNGMatterBase.initializeMatterSubscription();
    await ensureRmngMatterInChannelOrder();
    initialized = true;
  } catch (error) {
    console.warn(
      "[initializeRmngMatterSubscription] initializeMatterSubscription failed:",
      error,
    );
  }
}

export function isRmngMatterSubscriptionInitialized(): boolean {
  return initialized;
}

export function resetRmngMatterSubscriptionInitializedForTests(): void {
  initialized = false;
}
