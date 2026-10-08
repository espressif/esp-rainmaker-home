/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Structured debug logger for the web MQTT package.
 * @param event - Short event tag (e.g. `connect`, `message`)
 * @param data - Optional structured fields
 */
export function logWebMqtt(
  event: string,
  data?: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      source: "@modules/mqtt",
      event,
      ...(data ?? {}),
    }),
  );
}
