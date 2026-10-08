/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { QR_IMAGE_SOURCE_ERROR_NO_QR } from "@shared/utils/constants";

/**
 * Thrown when a web QR image cannot be decoded (no code in the image).
 */
export class QrImageDecodeError extends Error {
  readonly code: typeof QR_IMAGE_SOURCE_ERROR_NO_QR =
    QR_IMAGE_SOURCE_ERROR_NO_QR;

  /**
   * @param message - English fallback shown if the code is unmapped
   */
  constructor(message: string) {
    super(message);
    this.name = "QrImageDecodeError";
  }
}

/**
 * Narrows an unknown throw to {@link QrImageDecodeError}.
 * @param error - Caught value
 * @returns The typed error, or null
 */
export function asQrImageDecodeError(
  error: unknown,
): QrImageDecodeError | null {
  return error instanceof QrImageDecodeError ? error : null;
}
