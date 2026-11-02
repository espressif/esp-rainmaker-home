/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Races a promise against a timeout and clears the timer when either settles.
 * @param promise - Async operation to wait on
 * @param timeoutMs - Maximum wait time in milliseconds
 * @param timeoutError - Error, or error message, used when the timeout wins
 * @returns The settled promise result when it completes in time
 */
export const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: string | Error,
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        typeof timeoutError === "string"
          ? new Error(timeoutError)
          : timeoutError,
      );
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
};
