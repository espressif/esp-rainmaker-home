/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPProvisioner } from "esp-ble-prov";

import type { EspProtoVerInfo } from "@modules/ble-prov";

/** Runtime state for a connected or discovered RainMaker ESP device on web. */
export interface WebEspDeviceState {
  name: string;
  transport: string;
  security: number;
  serviceUuid: string;
  proofOfPossession: string;
  username: string;
  bluetoothDevice?: BluetoothDevice;
  provisioner?: ESPProvisioner;
  versionInfo: EspProtoVerInfo;
  capabilities: string[];
  connected: boolean;
  sessionEstablished: boolean;
  advertisementData?: Record<string, number[]>;
}
