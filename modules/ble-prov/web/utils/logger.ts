/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** Console prefix for Web Bluetooth debug logs. */
const BLE_LOG_PREFIX = "[BLE]";

/**
 * Logs a Web BLE step to the browser console for debugging.
 * @param step - Short step label (e.g. `connect:gatt`)
 * @param detail - Optional structured detail payload
 */
export function logWebBle(step: string, detail?: unknown): void {
  if (detail !== undefined) {
    console.log(BLE_LOG_PREFIX, step, detail);
    return;
  }

  console.log(BLE_LOG_PREFIX, step);
}

/**
 * Logs a Web BLE error with step context.
 * @param step - Step where the error occurred
 * @param error - Error object or message
 */
export function logWebBleError(step: string, error: unknown): void {
  console.error(BLE_LOG_PREFIX, step, error);
}
