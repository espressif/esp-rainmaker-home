/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPProvisioner } from "esp-ble-prov";

import {
  ESP_PROV_CONNECT_TIMEOUT_MS,
  ESP_PROV_PRIMARY_SERVICE_UUID,
  ESP_PROV_SERVICE_UUIDS,
} from "@modules/ble-prov";
import type { ScannedBleDevice } from "../types/types";
import { logWebBle } from "../utils/logger";
import { discoverProvisionerEndpoints } from "./gattEndpoints";

/**
 * Connects an ESPProvisioner to a known BluetoothDevice without reopening the
 * system device picker when the device was discovered via `requestLEScan`.
 * @param provisioner - Provisioner configured with service UUID and security
 * @param bluetoothDevice - Target BLE device
 * @param serviceUuid - Primary GATT service UUID to connect to
 */
export async function connectProvisionerToDevice(
  provisioner: ESPProvisioner,
  bluetoothDevice: BluetoothDevice,
  serviceUuid: string,
): Promise<void> {
  logWebBle("connect:gatt-start", {
    name: bluetoothDevice.name,
    serviceUuid,
  });

  provisioner.device = bluetoothDevice;

  bluetoothDevice.addEventListener("gattserverdisconnected", () => {
    void provisioner.disconnect();
  });

  const server = await bluetoothDevice.gatt?.connect();
  if (!server) {
    throw new Error("Failed to connect to GATT server");
  }

  logWebBle("connect:gatt-connected", { name: bluetoothDevice.name });

  provisioner.server = server;

  let service: BluetoothRemoteGATTService | null = null;
  const serviceCandidates = [
    serviceUuid,
    ...ESP_PROV_SERVICE_UUIDS.filter((uuid) => uuid !== serviceUuid),
  ];

  for (const candidate of serviceCandidates) {
    try {
      service = await server.getPrimaryService(candidate);
      break;
    } catch {
      // Try the next known provisioning service UUID.
    }
  }

  if (!service) {
    throw new Error("Provisioning GATT service not found on device");
  }

  logWebBle("connect:service-found", { serviceUuid: service.uuid });

  provisioner.service = service;

  await discoverProvisionerEndpoints(provisioner, server, service);

  (provisioner as unknown as { _isConnected: boolean })._isConnected = true;
}

/**
 * Connects using the Web Bluetooth device picker filtered to a single device name.
 * @param provisioner - Provisioner instance
 * @param deviceName - Exact BLE advertised name
 * @param serviceUuid - Service UUID to use for GATT connection
 */
export async function connectProvisionerViaPicker(
  provisioner: ESPProvisioner,
  deviceName: string,
  serviceUuid: string,
): Promise<void> {
  await provisioner.connect({
    filters: [{ name: deviceName }],
  });

  if (!provisioner.service) {
    await connectProvisionerToDevice(
      provisioner,
      provisioner.device!,
      serviceUuid,
    );
  }
}

/**
 * Establishes a GATT connection for an ESP-IDF protocomm provisioner over BLE.
 * @param provisioner - Configured `ESPProvisioner` instance
 * @param scanned - Device metadata from scan or picker
 * @param serviceUuid - Primary provisioning service UUID
 * @param timeoutMs - Connection timeout in milliseconds
 */
export async function connectBleProvisioner(
  provisioner: ESPProvisioner,
  scanned: ScannedBleDevice,
  serviceUuid: string = scanned.serviceUuid || ESP_PROV_PRIMARY_SERVICE_UUID,
  timeoutMs: number = ESP_PROV_CONNECT_TIMEOUT_MS,
): Promise<void> {
  const connectPromise = scanned.bluetoothDevice
    ? connectProvisionerToDevice(
        provisioner,
        scanned.bluetoothDevice,
        serviceUuid,
      )
    : connectProvisionerViaPicker(provisioner, scanned.name, serviceUuid);

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error("BLE connection timed out")),
      timeoutMs,
    );
  });

  await Promise.race([connectPromise, timeoutPromise]);
  logWebBle("connect:gatt-complete", { name: scanned.name });
}

/**
 * Disconnects a BLE provisioner and clears its GATT session.
 * @param provisioner - Active provisioner instance
 */
export async function disconnectBleProvisioner(
  provisioner: ESPProvisioner,
): Promise<void> {
  await provisioner.disconnect();
}
