/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** Discovered BLE device metadata before GATT connection. */
export interface ScannedBleDevice {
  name: string;
  bluetoothDevice: BluetoothDevice;
  serviceUuid: string;
  manufacturerData: number[];
}
