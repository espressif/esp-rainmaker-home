/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import asyncStorageAdapter from "@native-adaptors/implementations/ESPAsyncStorage";
import {
  CN_CONSENT_ACCEPTED_KEY,
  CONSENT_ACCEPTED_VALUE,
} from "@shared/utils/constants";

/**
 * Reads whether the CN-region privacy consent has already been accepted.
 * Resolves false on any storage error so the consent screen is shown again
 * rather than silently skipped.
 * @returns True when the user previously accepted the consent.
 */
export async function isConsentAccepted(): Promise<boolean> {
  try {
    const value = await asyncStorageAdapter.getItem(CN_CONSENT_ACCEPTED_KEY);
    return value === CONSENT_ACCEPTED_VALUE;
  } catch {
    return false;
  }
}

/**
 * Persists that the user accepted the CN-region privacy consent.
 * @returns Resolves once the flag is written.
 */
export async function setConsentAccepted(): Promise<void> {
  await asyncStorageAdapter.setItem(
    CN_CONSENT_ACCEPTED_KEY,
    CONSENT_ACCEPTED_VALUE
  );
}
