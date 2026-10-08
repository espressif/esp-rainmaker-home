/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Development-only console logging for the web target.
 *
 * Web provisioning and MQTT paths emit structured step logs that are useful
 * while debugging in a browser but must not ship in production bundles. Both
 * helpers are no-ops unless `__DEV__` is true (Metro sets it per build).
 */

/**
 * Logs a prefixed debug step, e.g. `logWebDebug("[WebBLE]", "scan:start", { devicePrefix })`.
 * @param prefix - Console prefix identifying the subsystem
 * @param step - Short step label
 * @param detail - Optional structured payload
 */
export function logWebDebug(prefix: string, step: string, detail?: unknown): void {
  if (!__DEV__) {
    return;
  }
  if (detail !== undefined) {
    console.log(prefix, step, detail);
    return;
  }
  console.log(prefix, step);
}

/**
 * Logs one JSON line, e.g. for MQTT event tracing that is grepped from the console.
 * @param event - Event name
 * @param data - Fields merged into the JSON line
 */
export function logWebDebugJson(event: string, data: Record<string, unknown>): void {
  if (!__DEV__) {
    return;
  }
  console.log(JSON.stringify({ event, ...data }));
}
