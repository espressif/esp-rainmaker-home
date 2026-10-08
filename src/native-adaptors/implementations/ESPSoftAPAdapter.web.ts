/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { rejectWebUnsupported } from "@native-adaptors/utils/webPlatform";

export interface ESPSoftAPConnectionResult {
  deviceName: string;
  capabilities: string[];
}

/**
 * SoftAP adaptor gate for web — native Wi-Fi SoftAP APIs are unavailable in
 * the browser; BLE provisioning uses `@modules/ble-prov` instead.
 */
export const ESPSoftAPAdapter = {
  /**
   * SoftAP settings are not available on web.
   * @returns Never resolves successfully on web
   */
  async openWifiSettings(): Promise<boolean> {
    return rejectWebUnsupported("SoftAP Wi-Fi settings");
  },

  /**
   * SoftAP connection check is not available on web.
   * @returns Never resolves successfully on web
   */
  async checkSoftAPConnection(): Promise<ESPSoftAPConnectionResult | null> {
    return rejectWebUnsupported("SoftAP connection check");
  },

  /**
   * Current Wi-Fi SSID is not available on web.
   * @returns Never resolves successfully on web
   */
  async getCurrentWifiSSID(): Promise<string | null> {
    return rejectWebUnsupported("current Wi-Fi SSID");
  },
};

export default ESPSoftAPAdapter;
