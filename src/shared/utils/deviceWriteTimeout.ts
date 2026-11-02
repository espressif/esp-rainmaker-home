/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { withTimeout } from "./asyncTimeout";

/** Error code a device write gets when the device never answered. */
export const DEVICE_NO_ANSWER_CODE = "DEVICE_NO_ANSWER";

/**
 * Fails a device write that has not answered in time, so a lost reply cannot
 * freeze the control. The command itself is not cancelled.
 * @param write - The pending write
 * @param timeoutMs - How long to wait for the answer
 * @returns The write's result, or a rejection with code `DEVICE_NO_ANSWER`
 */
export function failIfNoAnswer<T>(
  write: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const noAnswer = Object.assign(
    new Error(`Device did not answer within ${timeoutMs} ms`),
    { code: DEVICE_NO_ANSWER_CODE },
  );
  return withTimeout(write, timeoutMs, noAnswer);
}
