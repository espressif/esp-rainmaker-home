/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { delay } from "@shared/utils/common";

/** fetch's error when the request never got an HTTP answer. */
const NETWORK_FAILURE_MESSAGE = "Network request failed";
const DEFAULT_RETRIES = 1;
const DEFAULT_RETRY_WAIT_MS = 2_000;

/** How often and how long apart a request is run again. */
export interface NetworkRetryOptions {
  /** Extra runs after the first one fails at network level. Default 1. */
  retries?: number;
  /** Wait before each extra run, in ms. Default 2000. */
  delayMs?: number;
}

/**
 * Whether an error, or an error it wraps, is fetch failing to reach the
 * server. Server answers (wrong password, user not found) never match.
 * @param error - Error thrown by an SDK call.
 * @returns True for a network level failure.
 */
export function isNetworkFailure(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (
      current instanceof Error &&
      current.message === NETWORK_FAILURE_MESSAGE
    ) {
      return true;
    }
    const wrapper = current as { originalError?: unknown; cause?: unknown };
    current = wrapper.originalError ?? wrapper.cause;
  }
  return false;
}

/**
 * Runs a request again after a network level failure, so a short drop does
 * not fail the call. Other errors are thrown at once.
 * @param request - The SDK call.
 * @param label - Log tag of the caller.
 * @param options - Number of extra runs and the wait before each.
 * @returns The request's result.
 */
export async function retryOnNetworkFailure<T>(
  request: () => Promise<T>,
  label: string,
  options?: NetworkRetryOptions
): Promise<T> {
  const retries = options?.retries ?? DEFAULT_RETRIES;
  const delayMs = options?.delayMs ?? DEFAULT_RETRY_WAIT_MS;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      if (!isNetworkFailure(error) || attempt >= retries) throw error;
      console.warn(
        `[${label}] network request failed; retry ${attempt + 1} of ${retries}`
      );
      await delay(delayMs);
    }
  }
}
