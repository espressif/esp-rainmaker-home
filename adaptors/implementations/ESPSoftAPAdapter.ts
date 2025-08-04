/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import ESPSoftAPModule from "../interfaces/ESPSoftAPInterface";

export interface ESPSoftAPConnectionResult {
  deviceName: string;
  capabilities: string[];
}

export const ESPSoftAPAdapter = {
  /**
   * Opens the app settings page using public API.
   * This allows users to navigate to WiFi settings from the app's settings page.
   */
  async openWifiSettings(): Promise<boolean> {
    try {
      const result = await ESPSoftAPModule.openWifiSettings();
      return result;
    } catch (error) {
      console.error("ESPSoftAPAdapter: Error opening app settings:", error);
      return false;
    }
  },

  /**
   * Checks if device is connected to SoftAP and returns device info with capabilities.
   * This detects if the iOS device is connected to an ESP device's SoftAP.
   */
  async checkSoftAPConnection(): Promise<ESPSoftAPConnectionResult | null> {
    try {
      const result = await ESPSoftAPModule.checkSoftAPConnection();
      return result;
    } catch (error) {
      console.error("ESPSoftAPAdapter: Error checking SoftAP connection:", error);
      return null;
    }
  },

  /**
   * Gets the current WiFi SSID.
   * Used to identify which ESP device network the user is connected to.
   */
  async getCurrentWifiSSID(): Promise<string | null> {
    try {
      const result = await ESPSoftAPModule.getCurrentWifiSSID();
      return result;
    } catch (error) {
      console.error("ESPSoftAPAdapter: Error getting WiFi SSID:", error);
      return null;
    }
  }
};

export default ESPSoftAPAdapter;
