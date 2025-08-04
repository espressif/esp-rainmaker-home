/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { NativeModules } from "react-native";

export interface ESPSoftAPConnectionResult {
  deviceName: string;
  capabilities: string[];
}

interface ESPSoftAPInterface {
  /**
   * Opens the app settings page using public API.
   * @returns Promise<boolean> - true if settings were opened successfully
   */
  openWifiSettings(): Promise<boolean>;

  /**
   * Checks if device is connected to SoftAP and returns device info with capabilities.
   * @returns Promise<ESPSoftAPConnectionResult | null> - device info and capabilities if connected, null otherwise
   */
  checkSoftAPConnection(): Promise<ESPSoftAPConnectionResult | null>;

  /**
   * Gets the current WiFi SSID.
   * @returns Promise<string | null> - current SSID or null if not available
   */
  getCurrentWifiSSID(): Promise<string | null>;
}

const { ESPSoftAPModule } = NativeModules;

export default ESPSoftAPModule as ESPSoftAPInterface;
