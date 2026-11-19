/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { NativeModules } from "react-native";

interface ESPAppUtilityInterface {
  /**
   * Checks if BLE permissions are granted.
   */
  isBlePermissionGranted(): Promise<boolean>;
  
  /**
   * Checks if location permissions are granted.
   */
  isLocationPermissionGranted(): Promise<boolean>;
  
  /**
   * Checks if location services are enabled.
   */
  isLocationServicesEnabled(): Promise<boolean>;
  
  /**
   * Checks if Bluetooth is enabled/powered on.
   */
  isBluetoothEnabled(): Promise<boolean>;
  
  /**
   * Triggers the OS Bluetooth + location prompts. No-op on iOS, which asks at
   * launch.
   *
   * Only `promptBleAndLocationPermissions()` (src/shared/permissions) calls
   * this; on the Android CN build only after the purpose dialog was answered
   * "Allow".
   */
  requestAllPermissions(): void;

  /**
   * Records that the CN-region privacy consent was accepted; iOS then asks for
   * Bluetooth + location.
   */
  acceptCnConsent(): Promise<boolean>;

  /**
   * iOS only: asks for time to finish work if the app goes to the background.
   * @returns Id to pass to endBackgroundTask.
   */
  beginBackgroundTask?(name: string): Promise<number>;

  /** iOS only: gives the background time back. */
  endBackgroundTask?(taskId: number): void;
}

const { ESPAppUtilityModule } = NativeModules;

export default ESPAppUtilityModule as ESPAppUtilityInterface;
