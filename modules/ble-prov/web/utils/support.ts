/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Returns whether the host browser exposes the Web Bluetooth API.
 * @returns True when `navigator.bluetooth` is available
 */
export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

/**
 * Resolves whether the system Bluetooth radio is available for Web Bluetooth.
 * @returns Promise resolving to availability, or false when unsupported
 */
export async function getWebBluetoothAvailability(): Promise<boolean> {
  if (!isWebBluetoothSupported()) {
    return false;
  }

  try {
    return await navigator.bluetooth.getAvailability();
  } catch {
    return false;
  }
}

/**
 * Returns whether experimental BLE advertisement scanning is available.
 * @returns True when `requestLEScan` exists on the Bluetooth interface
 */
export function isBleAdvertisementScanSupported(): boolean {
  return (
    isWebBluetoothSupported() &&
    typeof navigator.bluetooth.requestLEScan === "function"
  );
}
