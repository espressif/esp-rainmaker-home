/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The app's native sign-in surfaces, presented to the SDK as one adapter.
 *
 * `getRMSDKConfig()` supplies a single `nativeLoginAdapter`, but there is one
 * platform bridge per provider (Google's account picker, Apple's authorization
 * sheet). This routes to the right one so each stays a self-contained module.
 *
 * A provider with no native surface (WeChat, GitHub) is simply absent from the
 * table, so it reports unavailable and the SDK uses its browser flow untouched.
 */

import type { ESPNativeLoginAdapterInterface } from "@espressif/rainmaker-base-sdk";

import {
  OAUTH_PROVIDER_APPLE,
  OAUTH_PROVIDER_GOOGLE,
} from "@shared/utils/constants";

import { appleNativeLoginAdapter } from "./ESPAppleSignInAdapter";
import { googleNativeLoginAdapter } from "./ESPGoogleSignInAdapter";

/**
 * Which bridge serves which provider.
 *
 * Keyed by the lowercased `ESPIdProvider` value the SDK passes, since it sends
 * display casing ("Google", "SignInWithApple") while the provider constants are
 * lowercase.
 */
const delegatesByProvider: Record<string, ESPNativeLoginAdapterInterface> = {
  [OAUTH_PROVIDER_GOOGLE]: googleNativeLoginAdapter,
  [OAUTH_PROVIDER_APPLE]: appleNativeLoginAdapter,
};

/**
 * The bridge for this provider, or undefined when none serves it.
 * @param identityProvider Provider name the SDK is logging in with.
 * @returns The matching delegate, if there is one.
 */
function delegateFor(
  identityProvider: string
): ESPNativeLoginAdapterInterface | undefined {
  return delegatesByProvider[identityProvider.toLowerCase()];
}

export const nativeLoginAdapter: ESPNativeLoginAdapterInterface = {
  /**
   * Whether a bridge can serve this provider on this build and device.
   * @param identityProvider Provider name the SDK is logging in with.
   * @returns True when `getIdToken` is worth attempting.
   */
  async isAvailable(identityProvider: string): Promise<boolean> {
    const delegate = delegateFor(identityProvider);
    return delegate ? await delegate.isAvailable(identityProvider) : false;
  },

  /**
   * Presents the account UI of the bridge that serves this provider.
   * @param identityProvider Provider name the SDK is logging in with.
   * @returns The provider's ID token, or null to fall back to the browser flow.
   */
  async getIdToken(identityProvider: string): Promise<string | null> {
    const delegate = delegateFor(identityProvider);
    return delegate ? await delegate.getIdToken(identityProvider) : null;
  },

  /**
   * Clears each bridge's cached account on session teardown.
   *
   * The SDK calls this without a provider — the session being torn down could
   * have come from any of them — so every bridge is asked. Never throws:
   * logout has already happened.
   *
   * Only Google actually does anything: it caches a last-used account, so
   * without the clear the next sign-in silently reuses it instead of showing
   * the chooser. Apple has no such call and needs none — the credential is
   * system-owned, so the app cannot forget it and the next sign-in re-presents
   * as "Continue with Apple ID …" regardless. `ESPAppleSignInAdapter`
   * therefore omits `signOut` and the optional call below skips it, matching
   * the native iOS app, whose own logout (`clearUserData()`) likewise calls
   * only `ESPGoogleSignInService.signOut()`.
   */
  async signOut(): Promise<void> {
    await Promise.all(
      Object.values(delegatesByProvider).map((delegate) => delegate.signOut?.())
    );
  },
};
