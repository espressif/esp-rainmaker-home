/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ERROR_CODES } from "./constants";
import { DEVICE_NO_ANSWER_CODE } from "./deviceWriteTimeout";

/** Shown when a failed write carries no error code we know. */
const GENERIC_FAILURE_KEY = "device.errors.fallback";

/**
 * Picks the message for a device write that failed: the error code's own
 * message, "Device is unreachable" when it never answered, else a generic one.
 * @param error - What the write rejected with
 * @returns Translation key for the toast
 */
export function messageKeyForFailedWrite(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === DEVICE_NO_ANSWER_CODE) return ERROR_CODES.NODE_UNREACHABLE;
  if (
    typeof code === "string" &&
    Object.prototype.hasOwnProperty.call(ERROR_CODES, code)
  ) {
    return ERROR_CODES[code as keyof typeof ERROR_CODES];
  }
  return GENERIC_FAILURE_KEY;
}
