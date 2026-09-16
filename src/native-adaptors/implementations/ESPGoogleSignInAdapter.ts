/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Google sign-in platform resource — the device's own account UI, handed to the
 * SDK.
 *
 * This is a platform capability only, in the same role as `provisionAdapter`
 * and `espOauthAdapter`: it is injected as `nativeLoginAdapter` in
 * `getRMSDKConfig()` and the SDK calls *into* it. It never talks to the
 * RainMaker backend and never touches session tokens — `ESPRMAuth.loginWithOauth`
 * owns choosing this path over the browser, exchanging the ID token, and
 * persisting the result.
 *
 * The native module (`ESPGoogleSignInModule`) wraps Credential Manager on
 * Android and the GoogleSignIn SDK on iOS.
 *
 * Availability is a runtime question — client ids can be unset, Play services
 * can be missing or stale — so `isAvailable` answers per attempt and the SDK
 * falls back to the hosted browser flow when it says no. Google login therefore
 * still works on an unconfigured build.
 *
 * NOT available in the CN region: the CN APK ships no Google Play services and
 * the CN cloud has no `/auth/federated` endpoint. CN does not list Google as a
 * provider, so the flow is never reached there.
 */

import { NativeModules } from "react-native";
import type { ESPNativeLoginAdapterInterface } from "@espressif/rainmaker-base-sdk";

import { OAUTH_PROVIDER_GOOGLE } from "@shared/utils/constants";

const { ESPGoogleSignInModule } = NativeModules;

/**
 * Rejection code the native modules raise when the picker cannot be presented
 * on this build or device. Distinguished from a real failure so this adapter
 * can decline the attempt (resolve null) and let the SDK use the browser.
 */
const GOOGLE_SIGN_IN_UNAVAILABLE = "GOOGLE_SIGN_IN_UNAVAILABLE";
/** Rejection code raised when the device has no Google account to pick. */
const GOOGLE_NO_ACCOUNT = "GOOGLE_NO_ACCOUNT";

/** Shape resolved by the native module: the Google ID token for the account. */
interface GoogleIdTokenResult {
  idToken?: string;
}

/** True while the picker is on screen, for the login flow's abandon watchdog. */
let pickerInProgress = false;

/**
 * Records whether the picker is on screen.
 * @param isVisible True once the picker is presented, false when it settles.
 */
function setPickerInProgress(isVisible: boolean): void {
  pickerInProgress = isVisible;
}

/**
 * Whether the native picker is on screen right now.
 *
 * The login flow's abandon watchdog cancels an attempt when the app returns to
 * the foreground without an authorization code, which is the correct read for a
 * browser leg the user walked away from. The native picker is not that: it
 * never backgrounds the app on Android, and on iOS the system consent alert
 * ("… wants to use google.com to Sign In") produces an inactive → active cycle
 * while the picker is still up and no token has arrived — which the watchdog
 * would otherwise score as an abandoned login. The overlay's close button still
 * cancels.
 */
export function isGoogleNativeLoginInProgress(): boolean {
  return pickerInProgress;
}

/**
 * Google's account UI as an SDK platform resource.
 *
 * Only the Google provider is served; anything else reports unavailable so the
 * SDK uses its browser flow.
 */
export const googleNativeLoginAdapter: ESPNativeLoginAdapterInterface = {
  /**
   * Whether the account picker can be presented for this provider on this
   * build and device.
   * @param identityProvider Provider name the SDK is logging in with.
   * @returns True when `getIdToken` is worth attempting.
   */
  async isAvailable(identityProvider: string): Promise<boolean> {
    if (identityProvider.toLowerCase() !== OAUTH_PROVIDER_GOOGLE) return false;
    if (!ESPGoogleSignInModule) return false;
    try {
      return (await ESPGoogleSignInModule.isAvailable()) === true;
    } catch (error) {
      console.warn("[googleNativeLoginAdapter] availability check failed:", error);
      return false;
    }
  },

  /**
   * Presents the account picker and returns the Google ID token for the chosen
   * account.
   *
   * Resolves null — declining the attempt so the SDK uses the browser — when
   * the picker turns out to be unusable, or when the device has no Google
   * account. The browser flow signs in with any account, so falling through
   * gets the user in rather than leaving them at a dead end.
   *
   * Any other rejection propagates unchanged, so a dismissed sheet reaches the
   * caller as a cancellation instead of silently reopening in a browser.
   * @param identityProvider Provider name the SDK is logging in with.
   * @returns The Google ID token, or null to fall back to the browser flow.
   */
  async getIdToken(identityProvider: string): Promise<string | null> {
    if (identityProvider.toLowerCase() !== OAUTH_PROVIDER_GOOGLE) return null;

    setPickerInProgress(true);
    try {
      const result: GoogleIdTokenResult = await ESPGoogleSignInModule.signIn();
      return result?.idToken ?? null;
    } catch (error) {
      if (
        hasGoogleErrorTag(error, GOOGLE_SIGN_IN_UNAVAILABLE) ||
        hasGoogleErrorTag(error, GOOGLE_NO_ACCOUNT)
      ) {
        console.warn(
          "[googleNativeLoginAdapter] picker unusable, deferring to the hosted flow:",
          error
        );
        return null;
      }
      throw error;
    } finally {
      setPickerInProgress(false);
    }
  },

  /**
   * Forgets the account this app signed in with, so the next sign-in shows the
   * chooser instead of reusing it. Called by the SDK during session teardown
   * (logout, password change, account deletion).
   *
   * Never throws: the session is already gone by then, so a credential provider
   * that cannot clear its state must not turn a completed logout into a
   * failure. The only consequence is that the chooser may preselect the last
   * account.
   */
  async signOut(): Promise<void> {
    if (!ESPGoogleSignInModule?.signOut) return;
    try {
      await ESPGoogleSignInModule.signOut();
    } catch (error) {
      console.warn("[googleNativeLoginAdapter] failed to clear credential state:", error);
    }
  },
};

/**
 * Matches a native rejection tag. React Native surfaces the native reject code
 * as `error.code`; the message is also checked so errors thrown from JS with
 * the tag inlined are recognised too.
 * @param error Unknown thrown value.
 * @param tag Rejection code to look for.
 * @returns True when the error carries that tag.
 */
function hasGoogleErrorTag(error: unknown, tag: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === tag) return true;
  return typeof message === "string" && message.includes(tag);
}
