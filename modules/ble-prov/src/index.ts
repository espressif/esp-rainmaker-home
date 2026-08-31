/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Public API for `@modules/ble-prov`.
 * Platform-safe exports (constants, shared logic, types).
 * Web BLE managers are exported from `../web` for browser builds.
 *
 * Shared constants/utils/types are exported before `BleProv` so `web/` can
 * import this package root without hitting an uninitialized circular edge
 * (BleProv.web → webProvisionManager → @modules/ble-prov).
 */

export * from "./utils/constants";
export * from "./utils";

export type { EspProtoVerInfo } from "./types/types";
export type { ScannedBleDevice } from "../web/types/types";
export type { WebEspDeviceState } from "../web/rainmaker/types/types";
export type {
  BleProvisionConnectStatus,
  BleProvisionDevice,
  BleProvisionStatus,
  BleProvisionTransportArg,
  BleProvisionWifiNetwork,
} from "./types/sdkTypes";
export { BleProvisionTransport } from "./types/sdkTypes";

export { default as BleProv } from "./BleProv";
