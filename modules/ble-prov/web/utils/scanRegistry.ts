/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** Active passive BLE scan handle, if any. */
let activeScan: BluetoothLEScan | null = null;

/**
 * Stores the active passive scan so it can be stopped later.
 * @param scan - Active `requestLEScan` instance
 */
export function setActiveScan(scan: BluetoothLEScan | null): void {
  activeScan = scan;
}

/**
 * Stops any in-progress passive BLE scan.
 */
export async function stopActiveScan(): Promise<void> {
  if (activeScan) {
    activeScan.stop();
    activeScan = null;
  }
}
