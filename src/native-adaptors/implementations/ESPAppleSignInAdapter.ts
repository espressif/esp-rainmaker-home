/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sign in with Apple platform resource — the system authorization sheet, handed
 * to the SDK.
 *
 * A platform capability only, in the same role as `ESPGoogleSignInAdapter`: it
 * is injected as part of `nativeLoginAdapter` in `getRMSDKConfig()` and the SDK
 * calls *into* it. It never talks to the RainMaker backend and never touches
 * session tokens — `ESPRMAuth.loginWithOauth` owns choosing this path over the
 * browser, exchanging the identity token, and persisting the result.
 *
 * The native module (`ESPAppleSignInModule`, iOS only) presents the sheet via
 * AuthenticationServices and returns the Apple ID's identity token.
 *
 * BACKEND SUPPORT IS THE GATE, and `ENABLE_NATIVE_APPLE_SIGN_IN` is how it is
 * declared. The SDK documents `ESPFederatedProvider.APPLE` as reserved for
 * future use, rejected with error code 101113 — which matched both clouds as
 * probed on 2026-08-19. Until that changes, enabling the flag means Apple login
 * fails after the sheet.
 *
 * The check is deliberately up-front only. There is no second, runtime fallback
 * for a backend that rejects the provider: that would mean every Apple login
 * presents the sheet, fails, and then opens a browser — two prompts for one
 * sign-in. The flag is taken at its word, so enabling it against a backend
 * without the provider is a misconfiguration that surfaces as a login error.
 * This matches `ESPGoogleSignInAdapter`, where only platform conditions fall
 * back and backend rejections are errors. Turning the flag on once the backend
 * lands is therefore the only change needed.
 *
 * Android always uses the hosted browser flow: there is no native Sign in with
 * Apple, and the module is absent from that build.
 */

import { NativeModules, Platform } from "react-native";
import type { ESPNativeLoginAdapterInterface } from "@espressif/rainmaker-base-sdk";

import { isNativeAppleSignInEnabled } from "@config/features.config";
import { OAUTH_PROVIDER_APPLE } from "@shared/utils/constants";

const { ESPAppleSignInModule } = NativeModules;

/**
 * Rejection code the native module raises when the sheet cannot be presented —
 * too old an OS, or no window to present from. Distinguished from a real
 * failure so this adapter can decline the attempt (resolve null) and let the
 * SDK use the browser.
 */
const APPLE_SIGN_IN_UNAVAILABLE = "APPLE_SIGN_IN_UNAVAILABLE";

/** Rejection code the native module raises for a sign-in that genuinely failed. */
const APPLE_SIGN_IN_FAILED = "APPLE_SIGN_IN_FAILED";

/**
 * Shape resolved by the native module. `fullName` and `email` are present only
 * on the FIRST authorization for this app — Apple never sends them again — so
 * neither can be relied on. `idToken` is what authenticates.
 */
interface AppleSignInResult {
  idToken?: string;
}

/** True while the sheet is on screen, for the login flow's abandon watchdog. */
let sheetInProgress = false;

/**
 * Whether a native Apple attempt is running right now.
 *
 * Same purpose as its Google counterpart: the login flow's abandon watchdog
 * cancels an attempt when the app returns to the foreground without an
 * authorization code, which misreads the system sheet — presenting it makes the
 * app inactive, and dismissing it makes the app active again with no browser leg
 * ever involved.
 */
export function isAppleNativeLoginInProgress(): boolean {
  return sheetInProgress;
}

/**
 * Apple's authorization sheet as an SDK platform resource.
 *
 * Only the Apple provider is served; anything else reports unavailable so the
 * SDK uses its browser flow.
 */
export const appleNativeLoginAdapter: ESPNativeLoginAdapterInterface = {
  /**
   * Whether the sheet can be presented for this provider on this build and
   * device. iOS-only, and opt-in per deployment because the backend is the real
   * gate (see the module comment).
   * @param identityProvider Provider name the SDK is logging in with.
   * @returns True when `getIdToken` is worth attempting.
   */
  async isAvailable(identityProvider: string): Promise<boolean> {
    if (identityProvider.toLowerCase() !== OAUTH_PROVIDER_APPLE) return false;
    if (Platform.OS !== "ios") return false;
    if (!isNativeAppleSignInEnabled()) return false;
    if (!ESPAppleSignInModule) return false;
    try {
      return (await ESPAppleSignInModule.isAvailable()) === true;
    } catch (error) {
      console.warn("[appleNativeLoginAdapter] availability check failed:", error);
      return false;
    }
  },

  /**
   * Presents the authorization sheet and returns the Apple identity token for
   * the account the user approves.
   *
   * Resolves null — declining the attempt so the SDK uses the browser — only
   * when the sheet was never presented. Once it HAS been presented, null is
   * the wrong answer: the SDK falls back to the browser on any null, without
   * distinguishing the two, so the user would approve the sheet and then be
   * asked to sign in again in a browser. Past that point the outcome is either
   * a token or a throw.
   * @param identityProvider Provider name the SDK is logging in with.
   * @returns The Apple identity token, or null to fall back to the browser flow.
   */
  async getIdToken(identityProvider: string): Promise<string | null> {
    if (identityProvider.toLowerCase() !== OAUTH_PROVIDER_APPLE) return null;

    sheetInProgress = true;
    try {
      const result: AppleSignInResult = await ESPAppleSignInModule.signIn();
      const idToken = result?.idToken;
      if (!idToken) {
        // Unreachable while the native module holds its contract: it rejects a
        // missing, undecodable or empty identity token rather than resolving
        // without one. Asserted anyway because the failure would be silent and
        // user-visible — the sheet is already approved by now, so returning
        // null would hand the user a second, browser-based prompt instead of
        // an error.
        throw new Error(
          `${APPLE_SIGN_IN_FAILED}: Sign in with Apple resolved without an identity token`
        );
      }
      return idToken;
    } catch (error) {
      if (hasAppleErrorTag(error, APPLE_SIGN_IN_UNAVAILABLE)) {
        console.warn(
          "[appleNativeLoginAdapter] sheet unusable, deferring to the hosted flow:",
          error
        );
        return null;
      }
      throw error;
    } finally {
      sheetInProgress = false;
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
function hasAppleErrorTag(error: unknown, tag: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === tag) return true;
  return typeof message === "string" && message.includes(tag);
}
