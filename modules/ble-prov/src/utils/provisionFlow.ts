/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Ordered BLE provisioning steps shared by Android, iOS, and web.
 * Feature hooks (`useScanBLE`, `usePOP`, `useClaiming`, `useWifi`, `useProvision`)
 * implement this sequence; each platform adaptor only supplies transport.
 */
export const PROVISION_FLOW_STEP = {
  PERMISSIONS: "permissions",
  SCAN: "scan",
  CONNECT: "connect",
  VERSION_INFO: "version-info",
  POP: "pop",
  SESSION: "session",
  CLAIMING: "claiming",
  WIFI_SCAN: "wifi-scan",
  CLOUD_PROVISION: "cloud-provision",
  DISCONNECT: "disconnect",
} as const;

/** Native ESP-IDF provisioning library BLE scan window (Android `BleScanner.SCAN_TIME_OUT`). */
export const ESP_PROV_NATIVE_BLE_SCAN_DURATION_MS = 6_000;

/**
 * Returns whether a scanned BLE advertisement should be exposed to the SDK layer.
 * Android native filters out devices with empty manufacturer data.
 * @param manufacturerData - Raw advertisement manufacturer bytes
 * @param allowEmptyManufacturerData - When true, skip the manufacturer-data gate (web picker path)
 * @returns True when the device should be included in scan results
 */
export function bleScanResultPassesManufacturerGate(
  manufacturerData: number[],
  allowEmptyManufacturerData = false,
): boolean {
  if (allowEmptyManufacturerData) {
    return true;
  }
  return manufacturerData.length > 0;
}
