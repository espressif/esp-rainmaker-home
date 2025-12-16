/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import ESPAppUtilityModule from "../interfaces/ESPAppUtilityInterface";

export const ESPAppUtilityAdapter = {
  /**
   * Checks if BLE permissions are granted.
   */
  async isBlePermissionGranted(): Promise<boolean> {
    try {
      const result = await ESPAppUtilityModule.isBlePermissionGranted();
      return result;
    } catch (error) {
      console.error("ESPAppUtilityAdapter: Error checking BLE permissions:", error);
      throw error;
    }
  },

  /**
   * Checks if location permissions are granted.
   */
  async isLocationPermissionGranted(): Promise<boolean> {
    try {
      const result = await ESPAppUtilityModule.isLocationPermissionGranted();
      return result;
    } catch (error) {
      console.error("ESPAppUtilityAdapter: Error checking location permissions:", error);
      throw error;
    }
  },

  /**
   * Checks if location services are enabled.
   */
  async isLocationServicesEnabled(): Promise<boolean> {
    try {
      const result = await ESPAppUtilityModule.isLocationServicesEnabled();
      return result;
    } catch (error) {
      console.error("ESPAppUtilityAdapter: Error checking location services:", error);
      return false;
    }
  },

  /**
   * Checks if Bluetooth is enabled/powered on.
   */
  async isBluetoothEnabled(): Promise<boolean> {
    try {
      const result = await ESPAppUtilityModule.isBluetoothEnabled();
      return result;
    } catch (error) {
      console.error("ESPAppUtilityAdapter: Error checking Bluetooth state:", error);
      return false;
    }
  },

  /**
   * Requests all required permissions.
   */
  requestAllPermissions(): void {
    try {
      ESPAppUtilityModule.requestAllPermissions();
    } catch (error) {
      console.error("ESPAppUtilityAdapter: Error requesting permissions:", error);
    }
  }
};

export default ESPAppUtilityAdapter;