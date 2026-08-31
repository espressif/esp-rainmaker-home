/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** Transport types for device provisioning (package-local; no CDF dependency). */
export enum BleProvisionTransport {
  BLE = "ble",
  SOFTAP = "softap",
}

/** Wi-Fi network entry returned from device scan. */
export interface BleProvisionWifiNetwork {
  ssid: string;
  rssi: number;
  secure: boolean;
  auth: number;
  bssid?: string;
  channel?: number;
}

/**
 * Device descriptor returned by scan / create flows.
 * Mirrors the native `ESPProvModule` / SDK device shape without CDF operations.
 */
export interface BleProvisionDevice {
  name: string;
  transport: string;
  security: number;
  connected?: boolean;
  username?: string;
  versionInfo?: Record<string, unknown>[];
  capabilities?: string[];
  advertisementData?: Record<string, unknown>[];
}

/** Connection result: `0` connected, `1` failed. */
export type BleProvisionConnectStatus = 0 | 1;

/** Provisioning result: `0` success, `1` failure. */
export type BleProvisionStatus = 0 | 1;

/** Transport argument accepted by search/create APIs. */
export type BleProvisionTransportArg = BleProvisionTransport | string;
