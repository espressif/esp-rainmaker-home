/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SDK id strings and adaptor identifiers only — no other app imports.
 * Keeps low-level modules (e.g. RMNeo transformers) off sdk.config/runtime.config
 * to avoid Metro require cycles.
 */

export const ESPRM_BASE_SDK_ID = "rainmaker-base-sdk" as const;
export const ESPRMMatter_BASE_SDK_ID = "rainmaker-matter-sdk" as const;
export const ESPRMNeo_BASE_SDK_ID = "rainmaker-neo-base-sdk" as const;
export const DEFAULT_ACTIVE_SDK_ID = ESPRMMatter_BASE_SDK_ID;

/** CDF / adaptor identifier — same value as the corresponding SDK id. */
export const ESPRMBaseAdaptorIdentifier = ESPRM_BASE_SDK_ID;
export const ESPRMMatterBaseAdaptorIdentifier = ESPRMMatter_BASE_SDK_ID;
export const ESPRMNeoBaseAdaptorIdentifier = ESPRMNeo_BASE_SDK_ID;


export type SDKIdentifier =
  | typeof ESPRM_BASE_SDK_ID
  | typeof ESPRMMatter_BASE_SDK_ID
  | typeof ESPRMNeo_BASE_SDK_ID;

/** Values allowed in scanned / runtime SDK field (Joi, UI, etc.). */
export const SUPPORTED_SDK_IDENTIFIERS = [
  ESPRM_BASE_SDK_ID,
  ESPRMMatter_BASE_SDK_ID,
  ESPRMNeo_BASE_SDK_ID,
] as const satisfies readonly SDKIdentifier[];

/**
 * Validates a persisted / scanned SDK id against {@link SUPPORTED_SDK_IDENTIFIERS}.
 * Unknown ids return `null`.
 *
 * @param sdk - Raw id from storage, env, or a config scan payload
 * @returns Canonical SDK id, or `null` when unrecognized
 */
export function normalizeSdkIdentifier(
  sdk: string | null | undefined,
): SDKIdentifier | null {
  if (!sdk) {
    return null;
  }
  if ((SUPPORTED_SDK_IDENTIFIERS as readonly string[]).includes(sdk)) {
    return sdk as SDKIdentifier;
  }
  return null;
}

/** True when the active stack is RainMaker Neo (`rainmaker-neo-base-sdk`). */
export function isRmneoStackSdkId(
  sdk: string | null | undefined,
): sdk is typeof ESPRMNeo_BASE_SDK_ID {
  return normalizeSdkIdentifier(sdk) === ESPRMNeo_BASE_SDK_ID;
}
