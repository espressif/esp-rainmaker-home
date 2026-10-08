/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Web-only provisioning barrel.
 * Layer 1: generic BLE primitives (`./support`, `./logger`, `./scanner`, `./scanRegistry`).
 * Layer 2: ESP-IDF protocomm (`./protocomm`).
 * Layer 3: RainMaker provisioning (`./rainmaker`).
 */

export {
  getWebBluetoothAvailability,
  isBleAdvertisementScanSupported,
  isWebBluetoothSupported,
} from "./utils/support";

export { logWebBle, logWebBleError } from "./utils/logger";

export {
  DEFAULT_BLE_SCAN_DURATION_MS,
  scanBleAdvertisements,
  requestBleDevice,
} from "./scanner";

export { setActiveScan, stopActiveScan } from "./utils/scanRegistry";

export type { ScannedBleDevice } from "./types/types";

export * from "./protocomm";

export { webProvisionManager } from "./rainmaker/provisionManager";
export type { WebEspDeviceState } from "./rainmaker/types/types";
