/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Native stub — web GATT endpoint helpers are unavailable on iOS/Android.
 * Metro resolves `webProvisionerEndpoints.web.ts` on web builds.
 */

/**
 * Returns whether the current runtime is a browser with DOM APIs.
 * @returns Always false on native builds
 */
export function isWebBleRuntime(): boolean {
  return false;
}

/**
 * Returns whether a named protocomm endpoint was discovered on the web provisioner.
 * @param _deviceName - Connected BLE device name
 * @param _endpoint - Protocomm endpoint name
 * @returns Always false on native
 */
export function webProvisionerHasEndpoint(
  _deviceName: string,
  _endpoint: string,
): boolean {
  return false;
}

/**
 * Lists protocomm endpoints discovered for a connected web BLE device.
 * @param _deviceName - Connected BLE device name
 * @returns Empty list on native
 */
export function webProvisionerListEndpoints(_deviceName: string): string[] {
  return [];
}

/**
 * Returns true when the `ch_resp` GATT endpoint was discovered on the device.
 * @param _deviceName - Connected BLE device name
 * @returns Always false on native
 */
export function webGattPrefersChallengeResponse(_deviceName: string): boolean {
  return false;
}
