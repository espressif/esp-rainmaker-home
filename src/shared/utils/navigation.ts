/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { router } from "expo-router";
import type { useRouter } from "expo-router";

import { NAVIGATION_THROTTLE_MS } from "@shared/utils/constants";

type AppRouter = ReturnType<typeof useRouter>;
type AppHref = Parameters<AppRouter["replace"]>[0];
type RouterPush = AppRouter["push"];

let pushThrottleInstalled = false;
let lastPushKey: string | null = null;
let lastPushAt = 0;

/**
 * Builds a stable key for a `router.push` target so duplicate destinations
 * can be throttled without blocking navigation to a different href.
 * @param href - Expo Router href (string or object)
 * @param options - Optional navigation options passed to `push`
 * @returns Serialized destination key, or empty string if serialization fails
 */
function getPushDestinationKey(
  href: Parameters<RouterPush>[0],
  options?: Parameters<RouterPush>[1],
): string {
  try {
    return JSON.stringify({ href, options });
  } catch {
    return String(href);
  }
}

/**
 * Patches the Expo Router singleton `router.push` with a leading-edge,
 * destination-keyed throttle. `useRouter()` returns the same object, so every
 * imperative push in the app is covered without per-call-site changes.
 *
 * Idempotent: safe to call from bootstrap / Fast Refresh more than once.
 */
export function installRouterPushThrottle(): void {
  if (pushThrottleInstalled) {
    return;
  }
  pushThrottleInstalled = true;

  const originalPush = router.push.bind(router) as RouterPush;

  router.push = ((href, options) => {
    const now = Date.now();
    const key = getPushDestinationKey(href, options);
    if (
      key.length > 0 &&
      key === lastPushKey &&
      now - lastPushAt < NAVIGATION_THROTTLE_MS
    ) {
      return;
    }
    lastPushKey = key;
    lastPushAt = now;
    originalPush(href, options);
  }) as RouterPush;
}

/**
 * Navigates to `href` as the *only* screen in the stack.
 *
 * `router.replace` swaps just the top entry, so everything below it survives.
 * That is wrong for the one-way doors around authentication:
 *
 * - Signing in must not leave Landing / Login underneath, or back from Home
 *   returns to the pre-auth flow (and re-picking a deployment there wipes the
 *   session, forcing a fresh login).
 * - Signing out and deleting an account must not leave Home underneath, or
 *   back from Login shows the signed-in UI with no data.
 *
 * Dismissing first collapses the stack, so `replace` then swaps the last
 * remaining entry and the destination is left alone at the bottom.
 */
export function resetStackTo(routerInstance: AppRouter, href: AppHref): void {
  if (routerInstance.canDismiss()) {
    routerInstance.dismissAll();
  }
  routerInstance.replace(href);
}
