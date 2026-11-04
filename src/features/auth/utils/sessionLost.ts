/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESP_TOKEN_ERROR,
  ESP_TOKEN_ERROR_SESSION_LOST_CODES,
} from "@shared/utils/constants";

const SESSION_LOST_CODES: ReadonlySet<string> = new Set(
  ESP_TOKEN_ERROR_SESSION_LOST_CODES,
);

/**
 * `true` for an SDK token error that no retry can fix: the stored tokens are
 * gone, so only a new login helps.
 * @param error - Error thrown by an SDK call
 * @returns Whether the session is lost
 */
export function isSessionLostError(error: unknown): boolean {
  const { label, code } = (error ?? {}) as { label?: string; code?: string };
  return label === ESP_TOKEN_ERROR && code !== undefined && SESSION_LOST_CODES.has(code);
}
