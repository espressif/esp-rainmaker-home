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
   * Requests all required permissions.
   */
  requestAllPermissions(): void;
}

const { ESPAppUtilityModule } = NativeModules;

export default ESPAppUtilityModule as ESPAppUtilityInterface;
