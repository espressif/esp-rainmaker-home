/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPRMNGBase } from "@espressif/rmng-base-sdk";
import {
  ESPRMNGMatterBase,
  MatterSubscriptionChannelIds,
} from "@espressif/rmng-matter-sdk";

const MATTER_CHANNEL_ID = MatterSubscriptionChannelIds.MATTER;

interface SubscriptionManagerLike {
  getGlobalChannelOrder?: () => string[];
  setGlobalChannelOrder: (ids: string[]) => void;
  getRegisteredChannels?: () => string[];
  registerChannel: (channel: unknown, autoInitialize?: boolean) => Promise<void>;
}

function getRmngSubscriptionManager(): SubscriptionManagerLike | undefined {
  return (
    ESPRMNGBase as unknown as { subscriptionManager?: SubscriptionManagerLike }
  ).subscriptionManager;
}

/**
 * Ensures the RMNG Matter subscription channel is registered and first in
 * channel order before subscribeToAllNodes / per-node retries.
 */
export async function ensureRmngMatterInChannelOrder(): Promise<void> {
  const subscriptionManager = getRmngSubscriptionManager();
  if (!subscriptionManager) return;

  const registeredBefore =
    subscriptionManager.getRegisteredChannels?.() ?? [];
  if (!registeredBefore.includes(MATTER_CHANNEL_ID)) {
    const matterChannel = ESPRMNGMatterBase.getMatterSubscriptionChannel?.();
    if (matterChannel) {
      try {
        await subscriptionManager.registerChannel(matterChannel);
        console.log(
          "[rmngMatterChannelOrder] re-registered matter channel; registeredBefore=",
          registeredBefore,
        );
      } catch (error) {
        console.warn(
          "[rmngMatterChannelOrder] register matter channel failed:",
          error,
        );
      }
    } else {
      console.warn(
        "[rmngMatterChannelOrder] matter channel missing — matter subscriptions will fail",
      );
    }
  }

  const current = subscriptionManager.getGlobalChannelOrder?.() ?? [];
  // Keep Matter first AND MQTT present as a fallback. The base SDK's
  // ESPRMNGNode constructor calls attachToMQTT() before the app tags the node
  // or sets its per-node channelOrder, so the attach resolves against THIS
  // global order. If `mqtt` is missing, every RMNG/hybrid/bridge node (Matter
  // unsupported until tagged) has no usable channel → "Failed to attach to
  // MQTT". A bare matter-first check is not enough — a `["matter"]`-only order
  // is already matter-first yet still lacks the mqtt fallback.
  const desired = Array.from(
    new Set([MATTER_CHANNEL_ID, ...current, "mqtt"]),
  );
  const alreadyCorrect =
    current.length === desired.length &&
    current.every((id, index) => id === desired[index]);
  if (alreadyCorrect) return;

  subscriptionManager.setGlobalChannelOrder(desired);
  console.log("[rmngMatterChannelOrder] channel order:", desired, "(was:", current, ")");
}
