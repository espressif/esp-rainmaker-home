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
  },

  /**
   * Records CN-region privacy consent natively and triggers the startup
   * permission prompts deferred until consent. Safe to call on any build.
   * @returns Resolves true once consent is recorded (false on error).
   */
  async acceptCnConsent(): Promise<boolean> {
    try {
      return await ESPAppUtilityModule.acceptCnConsent();
    } catch (error) {
      console.error("ESPAppUtilityAdapter: Error accepting consent:", error);
      return false;
    }
  },

  /**
   * Runs work while holding iOS background time, so a cloud call in flight
   * finishes even if the user leaves the app. Elsewhere it just runs the work.
   * @param name - Label for the background task.
   * @param work - The work to run.
   * @returns The work's result.
   */
  async runWithBackgroundTime<T>(name: string, work: () => Promise<T>): Promise<T> {
    if (!ESPAppUtilityModule?.beginBackgroundTask) {
      return work();
    }
    let taskId: number | null = null;
    try {
      taskId = await ESPAppUtilityModule.beginBackgroundTask(name);
    } catch (error) {
      console.warn("ESPAppUtilityAdapter: background time not granted:", error);
    }
    try {
      return await work();
    } finally {
      if (taskId !== null) {
        ESPAppUtilityModule.endBackgroundTask?.(taskId);
      }
    }
  }
};

export default ESPAppUtilityAdapter;