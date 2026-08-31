/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESP_PROV_MANUFACTURER_DATA_KEY } from "@modules/ble-prov";

/**
 * Builds the advertisement data map expected by the RainMaker SDK BLE filter.
 * @param manufacturerData - Raw manufacturer bytes from the BLE advertisement
 * @returns Advertisement data object for `ESPDeviceInterface`
 */
export function buildAdvertisementData(
  manufacturerData: number[],
): Record<string, number[]> | undefined {
  if (manufacturerData.length === 0) {
    return undefined;
  }

  return {
    [ESP_PROV_MANUFACTURER_DATA_KEY]: manufacturerData,
  };
}
