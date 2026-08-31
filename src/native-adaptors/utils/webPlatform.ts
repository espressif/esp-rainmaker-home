/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { WEB_PLATFORM_UNSUPPORTED_PREFIX } from "@shared/utils/constants";

/**
 * Builds a consistent error for native-only capabilities invoked on web.
 * @param featureName - Human-readable feature label
 * @returns Error instance with a stable message prefix
 */
export function createWebUnsupportedError(featureName: string): Error {
  return new Error(`${WEB_PLATFORM_UNSUPPORTED_PREFIX}: ${featureName}`);
}

/**
 * Throws a web-unsupported error for async native adaptor methods.
 * @param featureName - Human-readable feature label
 */
export async function rejectWebUnsupported(featureName: string): Promise<never> {
  throw createWebUnsupportedError(featureName);
}
