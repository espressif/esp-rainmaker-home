/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  isWebBlePermissionGranted,
  isWebBluetoothEnabled,
  isWebLocationPermissionGranted,
  isWebLocationServicesEnabled,
  requestWebPermissions,
} from "@native-adaptors/utils/webPermissions";

/**
 * Web implementation of app utility checks for BLE provisioning flows.
 * Maps native permission/service probes to browser APIs (Permissions, Geolocation, Web Bluetooth).
 */
export const ESPAppUtilityAdapter = {
  /**
   * Checks whether Web Bluetooth is available for provisioning in this browser.
   * @returns True when Web Bluetooth is supported and the adapter is available.
   */
  async isBlePermissionGranted(): Promise<boolean> {
    return isWebBlePermissionGranted();
  },

  /**
   * Web Bluetooth does not require geolocation, so this always resolves to
   * `true` — the shared permission flow treats location as granted on web
   * and never falls into the "location missing" copy on the permission
   * screen. No Permissions API call is made.
   * @returns Always `true` on web builds.
   */
  async isLocationPermissionGranted(): Promise<boolean> {
    return isWebLocationPermissionGranted();
  },

  /**
   * Web Bluetooth does not require the OS location services toggle, so
   * this always resolves to `true` — the shared readiness flow treats
   * location services as available on web.
   * @returns Always `true` on web builds.
   */
  async isLocationServicesEnabled(): Promise<boolean> {
    return isWebLocationServicesEnabled();
  },

  /**
   * Checks whether Bluetooth is available for Web Bluetooth.
   * @returns True when the host reports Bluetooth availability.
   */
  async isBluetoothEnabled(): Promise<boolean> {
    return isWebBluetoothEnabled();
  },

  /**
   * Triggers browser permission prompts where possible (geolocation).
   */
  requestAllPermissions(): void {
    requestWebPermissions();
  },

  /** No-op on web — browsers do not expose a single app-settings deep link. */
  openAppSettings: async (): Promise<void> => undefined,

  /**
   * No-op on web — CN region consent is enforced at the native layer via
   * this method, but browsers have no equivalent OS-level record to write.
   * Returns `true` to match the native adapter's success shape.
   */
  acceptCnConsent: async (): Promise<boolean> => true,

  /** Returns an empty version string on web builds. */
  getAppVersion: async (): Promise<string> => "",

  /** Returns an empty build number on web builds. */
  getBuildNumber: async (): Promise<string> => "",
};

export default ESPAppUtilityAdapter;
