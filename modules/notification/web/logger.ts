/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Structured debug logger for the web notification package.
 * @param event - Short event tag (e.g. `token`, `message`)
 * @param data - Optional structured fields
 */
export function logWebNotification(
  event: string,
  data?: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      source: "@modules/notification",
      event,
      ...(data ?? {}),
    }),
  );
}
