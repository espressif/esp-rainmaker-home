/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getWebBluetoothAvailability,
  isWebBluetoothSupported,
} from "@modules/ble-prov/web";

/**
 * Returns whether the browser supports Web Bluetooth for provisioning.
 * Device access is granted per connection via the browser picker, not upfront.
 * @returns True when `navigator.bluetooth` is available.
 */
export async function isWebBlePermissionGranted(): Promise<boolean> {
  return isWebBluetoothSupported();
}

/**
 * Returns whether location permission is satisfied for web BLE provisioning.
 * Geolocation is not required for Web Bluetooth; always treated as granted.
 * @returns True on web builds.
 */
export async function isWebLocationPermissionGranted(): Promise<boolean> {
  return true;
}

/**
 * Returns whether location services are considered enabled for web BLE flows.
 * Geolocation is not required for Web Bluetooth on desktop browsers.
 * @returns True on web builds.
 */
export async function isWebLocationServicesEnabled(): Promise<boolean> {
  return true;
}

/**
 * Returns whether the system Bluetooth radio is available for Web Bluetooth.
 * @returns True when Web Bluetooth is supported and the adapter reports availability.
 */
export async function isWebBluetoothEnabled(): Promise<boolean> {
  if (!isWebBluetoothSupported()) {
    return false;
  }

  return getWebBluetoothAvailability();
}

/**
 * No-op on web. Web Bluetooth does not require geolocation, and every Web
 * Bluetooth device is granted per-connection via the browser picker — there
 * is no upfront prompt to trigger here.
 */
export function requestWebPermissions(): void {
  return;
}
