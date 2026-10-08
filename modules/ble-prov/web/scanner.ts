/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ScannedBleDevice } from "./types/types";
import { logWebBle, logWebBleError } from "./utils/logger";
import { isBleAdvertisementScanSupported } from "./utils/support";

/** Default passive BLE scan duration (ms) when the caller doesn't specify one. */
export const DEFAULT_BLE_SCAN_DURATION_MS = 6_000;

/**
 * Extracts manufacturer-specific data bytes from a BLE advertisement event.
 * @param event - BLE scan advertisement event
 * @returns Manufacturer data byte array, or empty when unavailable
 */
function getManufacturerDataFromAdvertisement(
  event: BluetoothAdvertisingEvent,
): number[] {
  if (!event.manufacturerData) {
    return [];
  }

  const values: number[] = [];
  event.manufacturerData.forEach((data) => {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    bytes.forEach((byte) => values.push(byte));
  });
  return values;
}

/**
 * Picks the first advertised service UUID that matches a known candidate.
 * @param uuids - Service UUIDs from the advertisement
 * @param serviceUuids - Candidate service UUIDs the caller is scanning for
 * @returns Matching UUID, or the first candidate as a fallback
 */
function resolveAdvertisedServiceUuid(
  uuids: BluetoothServiceUUID[],
  serviceUuids: readonly string[],
): string {
  const normalized = uuids.map((uuid) => String(uuid).toLowerCase());
  const match = serviceUuids.find((candidate) => normalized.includes(candidate));
  return match ?? serviceUuids[0];
}

/**
 * Passive BLE scan using `requestLEScan` (Chrome / Edge).
 * @param serviceUuids - Service UUIDs to filter advertisements on
 * @param devicePrefix - Name prefix filter (empty matches all names)
 * @param durationMs - Scan duration in milliseconds
 * @returns Discovered devices with advertisement metadata
 */
export async function scanBleAdvertisements(
  serviceUuids: readonly string[],
  devicePrefix: string = "",
  durationMs: number = DEFAULT_BLE_SCAN_DURATION_MS,
): Promise<ScannedBleDevice[]> {
  if (!isBleAdvertisementScanSupported()) {
    logWebBle("scan:passive-unsupported");
    return [];
  }

  logWebBle("scan:passive-start", { devicePrefix, durationMs, serviceUuids });

  const devices = new Map<string, ScannedBleDevice>();

  const scan = await navigator.bluetooth.requestLEScan({
    filters: [{ services: [...serviceUuids] }],
    keepRepeatedDevices: true,
  });

  const onAdvertisement = (event: BluetoothAdvertisingEvent) => {
    const name = event.device.name ?? event.name;
    if (!name || !name.startsWith(devicePrefix)) {
      return;
    }

    const manufacturerData = getManufacturerDataFromAdvertisement(event);
    const serviceUuid = resolveAdvertisedServiceUuid(
      event.uuids ?? [],
      serviceUuids,
    );

    devices.set(name, {
      name,
      bluetoothDevice: event.device,
      serviceUuid,
      manufacturerData,
    });
  };

  navigator.bluetooth.addEventListener(
    "advertisementreceived",
    onAdvertisement,
  );

  try {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, durationMs);
    });
  } finally {
    navigator.bluetooth.removeEventListener(
      "advertisementreceived",
      onAdvertisement,
    );
    scan.stop();
  }

  const results = Array.from(devices.values());
  logWebBle("scan:passive-complete", {
    count: results.length,
    names: results.map((device) => device.name),
  });

  return results;
}

/**
 * Prompts the user to pick a single BLE device via the Web Bluetooth chooser.
 * @param serviceUuids - Service UUIDs to accept as optional services
 * @param deviceName - Exact device name to filter on
 * @param devicePrefix - Prefix filter when name is empty
 * @returns Selected device metadata
 */
export async function requestBleDevice(
  serviceUuids: readonly string[],
  deviceName?: string,
  devicePrefix: string = "",
): Promise<ScannedBleDevice> {
  const filters: BluetoothLEScanFilter[] = deviceName
    ? [{ name: deviceName }]
    : [{ namePrefix: devicePrefix }];

  logWebBle("picker:open", { filters, deviceName, devicePrefix });

  let bluetoothDevice: BluetoothDevice;
  try {
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters,
      optionalServices: [...serviceUuids],
    });
  } catch (error) {
    logWebBleError("picker:cancelled-or-failed", error);
    throw error;
  }

  logWebBle("picker:selected", {
    name: bluetoothDevice.name,
    id: bluetoothDevice.id,
  });

  if (!bluetoothDevice.name) {
    throw new Error("Selected device has no advertised name");
  }

  return {
    name: bluetoothDevice.name,
    bluetoothDevice,
    serviceUuid: serviceUuids[0],
    manufacturerData: [],
  };
}
