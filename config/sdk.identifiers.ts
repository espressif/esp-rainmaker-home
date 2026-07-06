/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SDK id strings and adaptor identifiers only — no other app imports.
 * Keeps low-level modules (e.g. RMNG transformers) off sdk.config/runtime.config
 * to avoid Metro require cycles.
 */

export const ESPRM_BASE_SDK_ID = "rainmaker-base-sdk" as const;
export const ESPRMMatter_BASE_SDK_ID = "rainmaker-matter-sdk" as const;
export const ESPRMNG_BASE_SDK_ID = "rmng-base-sdk" as const;
export const ESPRMNGMatter_BASE_SDK_ID = "rmng-matter-sdk" as const;
export const DEFAULT_ACTIVE_SDK_ID = ESPRMMatter_BASE_SDK_ID;

/** CDF / adaptor identifier — same value as the corresponding SDK id. */
export const ESPRMBaseAdaptorIdentifier = ESPRM_BASE_SDK_ID;
export const ESPRMMatterBaseAdaptorIdentifier = ESPRMMatter_BASE_SDK_ID;
export const ESPRMNGBaseAdaptorIdentifier = ESPRMNG_BASE_SDK_ID;
export const ESPRMNGMatterBaseAdaptorIdentifier = ESPRMNGMatter_BASE_SDK_ID;

export type SDKIdentifier =
  | typeof ESPRM_BASE_SDK_ID
  | typeof ESPRMMatter_BASE_SDK_ID
  | typeof ESPRMNG_BASE_SDK_ID
  | typeof ESPRMNGMatter_BASE_SDK_ID;

/** Values allowed in scanned / runtime SDK field (Joi, UI, etc.). */
export const SUPPORTED_SDK_IDENTIFIERS = [
  ESPRM_BASE_SDK_ID,
  ESPRMMatter_BASE_SDK_ID,
  ESPRMNG_BASE_SDK_ID,
  ESPRMNGMatter_BASE_SDK_ID,
] as const satisfies readonly SDKIdentifier[];

/** RMNG base or RMNG+Matter active stack (not legacy rainmaker SDKs). */
export function isRmngStackSdkId(
  sdk: string | null | undefined,
): sdk is typeof ESPRMNG_BASE_SDK_ID | typeof ESPRMNGMatter_BASE_SDK_ID {
  return sdk === ESPRMNG_BASE_SDK_ID || sdk === ESPRMNGMatter_BASE_SDK_ID;
}
