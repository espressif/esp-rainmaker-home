/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ESPRMBase,
    SubscriptionChannelIds,
} from "@espressif/rainmaker-base-sdk";
import { ESPRMMatterBase } from "@espressif/rainmaker-matter-sdk";

/**
 * Channel id used by {@link MatterSubscriptionChannel}. Hardcoded as a
 * string literal rather than re-exporting from `@espressif/rainmaker-matter-sdk`
 * because the value is stable per the Matter SDK spec and the registration
 * flow needs to compare against this id even before the channel itself is
 * resolved through the SDK.
 */
export const MATTER_CHANNEL_ID = "matter" as const;

/**
 * Minimal shape of {@link ESPSubscriptionManager} we touch from here.
 * Typed locally instead of importing the class, to avoid leaking the base
 * SDK's internal types into this adaptor surface.
 */
interface SubscriptionManagerLike {
    getGlobalChannelOrder?: () => string[];
    setGlobalChannelOrder: (ids: string[]) => void;
    getRegisteredChannels?: () => string[];
    registerChannel: (
        channel: unknown,
        autoInitialize?: boolean,
    ) => Promise<void>;
}

function getBaseSubscriptionManager(): SubscriptionManagerLike | undefined {
    return (
        ESPRMBase as unknown as { subscriptionManager?: SubscriptionManagerLike }
    ).subscriptionManager;
}

/**
 * Ensures that the Matter subscription channel is registered AND present at
 * the head of the subscription manager's global channel order before a
 * subscribe call. There are two failure modes this guards against:
 *
 * 1. Order clobber. The base SDK's `configure()` registers the notification
 *    channel asynchronously and overwrites `globalChannelOrder` to
 *    `[NOTIFICATION]` once that registration resolves. That can happen
 *    after `ESPRMMatterBaseSDKAdaptor.initializeSDK()` set the order to
 *    `[MATTER, NOTIFICATION]`, leaving the matter channel registered but
 *    unreachable.
 *
 * 2. Manager-instance mismatch / lost registration. If the matter SDK and
 *    this transformer happen to see different `ESPRMBase.subscriptionManager`
 *    instances (e.g. a duplicate package resolution), the matter channel
 *    will only be registered on the matter SDK's view, and
 *    `getRegisteredChannels()` here will not include `"matter"` — even
 *    though boot-time logs reported a successful registration. We re-resolve
 *    the channel via `ESPRMMatterBase.getMatterSubscriptionChannel()` and
 *    register it on the manager we are about to call `subscribeToAllNodes`
 *    on, so the channel is guaranteed to be available on this exact
 *    instance.
 *
 * Idempotent: a no-op when Matter is already registered and at the head of
 * the order.
 */
export async function ensureMatterInChannelOrder(): Promise<void> {
    const subscriptionManager = getBaseSubscriptionManager();
    if (!subscriptionManager) return;

    const registeredBefore =
        subscriptionManager.getRegisteredChannels?.() ?? [];
    if (!registeredBefore.includes(MATTER_CHANNEL_ID)) {
        const matterChannel = ESPRMMatterBase.getMatterSubscriptionChannel?.();
        if (matterChannel) {
            try {
                await subscriptionManager.registerChannel(matterChannel);
                console.log(
                    "[matterChannelOrder] re-registered matter channel on base subscription manager (was missing); registeredBefore=",
                    registeredBefore,
                );
            } catch (error) {
                console.warn(
                    "[matterChannelOrder] re-register matter channel failed:",
                    error,
                );
            }
        } else {
            console.warn(
                "[matterChannelOrder] matter channel missing and ESPRMMatterBase.getMatterSubscriptionChannel() returned no channel — matter subscriptions will fail",
            );
        }
    }

    const current = subscriptionManager.getGlobalChannelOrder?.() ?? [];
    const registeredAfter =
        subscriptionManager.getRegisteredChannels?.() ?? [];
    if (current[0] === MATTER_CHANNEL_ID) return;

    const desired = Array.from(
        new Set([
            MATTER_CHANNEL_ID,
            ...current,
            SubscriptionChannelIds.NOTIFICATION,
        ]),
    );
    subscriptionManager.setGlobalChannelOrder(desired);
    console.log(
        "[matterChannelOrder] reset global channel order:",
        desired,
        "(was:",
        current,
        ", registered:",
        registeredAfter,
        ")",
    );
}
