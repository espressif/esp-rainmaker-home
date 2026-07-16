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
   * Requests all required permissions.
   */
  requestAllPermissions(): void;

  /**
   * Records that the CN-region privacy consent was accepted and runs the
   * startup permission prompts that were deferred until consent (no-op on
   * non-CN builds).
   */
  acceptCnConsent(): Promise<boolean>;
}

const { ESPAppUtilityModule } = NativeModules;

export default ESPAppUtilityModule as ESPAppUtilityInterface;
