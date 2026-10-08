/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { gattEndpointsIncludeChallengeResponse } from "@modules/ble-prov";
import { webProvisionManager } from "@modules/ble-prov/web";

/**
 * Returns whether the current runtime is a browser with DOM APIs.
 * @returns True on web builds
 */
export function isWebBleRuntime(): boolean {
  return typeof navigator !== "undefined" && typeof document !== "undefined";
}

/**
 * Returns whether a named protocomm endpoint was discovered on the web provisioner.
 * @param deviceName - Connected BLE device name
 * @param endpoint - Protocomm endpoint name (e.g. `ch_resp`)
 * @returns True when the endpoint exists on the active GATT session
 */
export function webProvisionerHasEndpoint(
  deviceName: string,
  endpoint: string,
): boolean {
  return webProvisionManager.hasEndpoint(deviceName, endpoint);
}

/**
 * Lists protocomm endpoints discovered for a connected web BLE device.
 * @param deviceName - Connected BLE device name
 * @returns Endpoint names from the active GATT session
 */
export function webProvisionerListEndpoints(deviceName: string): string[] {
  return webProvisionManager.listEndpoints(deviceName);
}

/**
 * Returns true when the `ch_resp` GATT endpoint was discovered on the device.
 * @param deviceName - Connected BLE device name
 * @returns True when web GATT exposes the challenge-response endpoint
 */
export function webGattPrefersChallengeResponse(deviceName: string): boolean {
  return gattEndpointsIncludeChallengeResponse(
    webProvisionerListEndpoints(deviceName),
  );
}
