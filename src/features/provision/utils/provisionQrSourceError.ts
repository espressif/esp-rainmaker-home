/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PROVISION_QR_SOURCE_ERROR_CLIPBOARD_DENIED,
  PROVISION_QR_SOURCE_ERROR_EMPTY,
  PROVISION_QR_SOURCE_ERROR_NO_QR,
  PROVISION_QR_SOURCE_ERROR_UNSUPPORTED,
} from "@features/provision/constants";

export type ProvisionQrSourceErrorCode =
  | typeof PROVISION_QR_SOURCE_ERROR_NO_QR
  | typeof PROVISION_QR_SOURCE_ERROR_UNSUPPORTED
  | typeof PROVISION_QR_SOURCE_ERROR_EMPTY
  | typeof PROVISION_QR_SOURCE_ERROR_CLIPBOARD_DENIED;

/**
 * Typed error for web provision QR/file input failures so the UI can map to i18n.
 */
export class ProvisionQrSourceError extends Error {
  readonly code: ProvisionQrSourceErrorCode;

  /**
   * @param code - Stable error code for i18n mapping
   * @param message - English fallback shown if the code is unmapped
   */
  constructor(code: ProvisionQrSourceErrorCode, message: string) {
    super(message);
    this.name = "ProvisionQrSourceError";
    this.code = code;
  }
}

/**
 * Narrows an unknown throw to {@link ProvisionQrSourceError}.
 * @param error - Caught value
 * @returns The typed error, or null
 */
export function asProvisionQrSourceError(
  error: unknown,
): ProvisionQrSourceError | null {
  return error instanceof ProvisionQrSourceError ? error : null;
}
