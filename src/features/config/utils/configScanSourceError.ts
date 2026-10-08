/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CONFIG_SCAN_SOURCE_ERROR_CLIPBOARD_DENIED,
  CONFIG_SCAN_SOURCE_ERROR_EMPTY,
  CONFIG_SCAN_SOURCE_ERROR_NO_QR,
  CONFIG_SCAN_SOURCE_ERROR_UNSUPPORTED,
} from "@features/config/constants";

export type ConfigScanSourceErrorCode =
  | typeof CONFIG_SCAN_SOURCE_ERROR_NO_QR
  | typeof CONFIG_SCAN_SOURCE_ERROR_UNSUPPORTED
  | typeof CONFIG_SCAN_SOURCE_ERROR_EMPTY
  | typeof CONFIG_SCAN_SOURCE_ERROR_CLIPBOARD_DENIED;

/**
 * Typed error for web QR/file input failures so the UI can map to i18n.
 */
export class ConfigScanSourceError extends Error {
  readonly code: ConfigScanSourceErrorCode;

  /**
   * @param code - Stable error code for i18n mapping
   * @param message - English fallback shown if the code is unmapped
   */
  constructor(code: ConfigScanSourceErrorCode, message: string) {
    super(message);
    this.name = "ConfigScanSourceError";
    this.code = code;
  }
}

/**
 * Narrows an unknown throw to {@link ConfigScanSourceError}.
 * @param error - Caught value
 * @returns The typed error, or null
 */
export function asConfigScanSourceError(
  error: unknown,
): ConfigScanSourceError | null {
  return error instanceof ConfigScanSourceError ? error : null;
}
