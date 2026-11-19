/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WeChat login bridge (CN region only).
 *
 * The native module (`ESPWeChatModule`) drives the WeChat SDK — registration and
 * `sendReq` — and returns the raw WeChat authorization `code` to JS. The token
 * exchange is then performed by the RainMaker Base SDK via
 * `ESPRMAuth.loginWithOauthCode(code, { wechatTokenOnly: true })`, which POSTs the
 * WeChat token exchange (`wechat_token_only=true`, `identity_provider=WECHATNOVA`)
 * and persists the resulting tokens under its own storage keys. The caller then
 * runs `store.userStore.restoreSession()` to rebuild the authenticated session.
 */

import { NativeModules } from "react-native";
import { ESPRMBase } from "@espressif/rainmaker-base-sdk";

import { getRMSDKConfig } from "@config/sdk.config";

const { ESPWeChatModule } = NativeModules;

/** Shape resolved by the native module: the raw WeChat authorization code. */
interface WeChatCodeResult {
  code?: string;
}

/** True while the WeChat app is open and no code has come back yet. */
let waitingForWeChatCode = false;

/**
 * Whether the WeChat app is open and no authorization code has come back yet.
 * @returns True while `performWeChatLogin` waits for the code.
 */
export function isWaitingForWeChatCode(): boolean {
  return waitingForWeChatCode;
}

/** Clears the wait for a WeChat request that was given up. */
export function stopWaitingForWeChatCode(): void {
  waitingForWeChatCode = false;
}

/**
 * Runs WeChat login: native returns the authorization code, then the Base SDK
 * exchanges it for RainMaker tokens and persists them (so a subsequent
 * `restoreSession()` establishes the session).
 * @throws Error tagged `WECHAT_*` on native failure (e.g. `WECHAT_CANCELLED`,
 *   `WECHAT_NOT_INSTALLED`, `WECHAT_AUTH_DENIED`), or an SDK error if the token
 *   exchange fails.
 */
export async function performWeChatLogin(): Promise<void> {
  if (!ESPWeChatModule) {
    throw new Error(
      "WECHAT_MODULE_NOT_AVAILABLE: ESPWeChatModule native module not found. Rebuild the CN app."
    );
  }

  const { authUrl, clientId, redirectUrl } = getRMSDKConfig() as {
    authUrl?: string;
    clientId?: string;
    redirectUrl?: string;
  };

  if (!authUrl || !clientId) {
    throw new Error("WECHAT_CONFIG_ERROR: RM auth URL or client id is not configured.");
  }

  // Passed only to satisfy the existing native method signature/validation; the
  // token exchange no longer happens natively (the Base SDK does it below using
  // its own configured cloud).
  const tokenUrl = `${authUrl.replace(/\/+$/, "")}/token`;

  waitingForWeChatCode = true;
  let result: WeChatCodeResult;
  try {
    result = await ESPWeChatModule.initiateWeChatLogin(
      tokenUrl,
      clientId,
      redirectUrl ?? ""
    );
  } finally {
    waitingForWeChatCode = false;
  }

  const code = result?.code;
  if (!code) {
    throw new Error("WECHAT_AUTH_FAILED: no authorization code returned from native.");
  }

  // The Base SDK performs the WeChat token exchange (POST /token with
  // wechat_token_only=true + identity_provider=WECHATNOVA) and persists the
  // tokens under its own storage keys.
  await ESPRMBase.getAuthInstance().loginWithOauthCode(code, {
    wechatTokenOnly: true,
  });
}

/** True when an error represents the user cancelling or denying WeChat auth. */
export function isWeChatCancellation(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("WECHAT_CANCELLED") ||
      error.message.includes("WECHAT_AUTH_DENIED"))
  );
}
