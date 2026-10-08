/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPProvisioner } from "esp-ble-prov";

import { ESP_PROV_GATT_USER_DESC_UUID } from "@modules/ble-prov";
import { logWebBle, logWebBleError } from "../utils/logger";

/**
 * Normalizes a protocomm endpoint name read from a GATT user-description descriptor.
 * @param raw - Raw descriptor bytes decoded as UTF-8
 * @returns Trimmed endpoint name without null padding
 */
export function normalizeProvisionerEndpointName(raw: string): string {
  return raw.replace(/\0/g, "").trim();
}

/**
 * Discovers protocomm endpoints from all primary GATT services and maps them on the provisioner.
 * @param provisioner - Active BLE provisioner instance
 * @param server - Connected GATT server
 * @param primaryService - Provisioning service used for Wi-Fi protocomm
 * @returns Discovered endpoint names
 */
export async function discoverProvisionerEndpoints(
  provisioner: ESPProvisioner,
  server: BluetoothRemoteGATTServer,
  primaryService: BluetoothRemoteGATTService,
): Promise<string[]> {
  provisioner.service = primaryService;
  provisioner.endpoints.clear();

  const services = new Map<string, BluetoothRemoteGATTService>();
  services.set(primaryService.uuid, primaryService);

  try {
    const primaryServices = await server.getPrimaryServices();
    for (const service of primaryServices) {
      services.set(service.uuid, service);
    }
  } catch (error) {
    logWebBleError("endpoints:list-services-failed", error);
  }

  const textDecoder = new TextDecoder();

  for (const service of services.values()) {
    const characteristics = await service.getCharacteristics();

    for (const characteristic of characteristics) {
      try {
        const descriptor = await characteristic.getDescriptor(
          ESP_PROV_GATT_USER_DESC_UUID,
        );
        const endpointName = normalizeProvisionerEndpointName(
          textDecoder.decode(await descriptor.readValue()),
        );

        if (endpointName) {
          provisioner.endpoints.set(endpointName, characteristic);
        }
      } catch {
        // Characteristics without a user-description descriptor are not protocomm endpoints.
      }
    }
  }

  const endpointNames = Array.from(provisioner.endpoints.keys());
  logWebBle("endpoints:discovered", {
    count: endpointNames.length,
    endpoints: endpointNames,
  });

  if (provisioner.endpoints.size === 0) {
    throw new Error("No provisioning endpoints discovered on device");
  }

  return endpointNames;
}

/**
 * Re-discovers endpoints when a named protocomm endpoint is missing from the current map.
 * @param provisioner - Active BLE provisioner
 * @param endPoint - Endpoint the caller intends to use
 * @returns True when the endpoint exists after rediscovery
 */
export async function ensureProvisionerEndpoint(
  provisioner: ESPProvisioner,
  endPoint: string,
): Promise<boolean> {
  if (provisioner.endpoints.has(endPoint)) {
    return true;
  }

  if (!provisioner.server || !provisioner.service) {
    logWebBle("endpoints:missing-server", {
      endPoint,
      known: Array.from(provisioner.endpoints.keys()),
    });
    return false;
  }

  logWebBle("endpoints:rediscover", {
    endPoint,
    known: Array.from(provisioner.endpoints.keys()),
  });

  await discoverProvisionerEndpoints(
    provisioner,
    provisioner.server,
    provisioner.service,
  );

  return provisioner.endpoints.has(endPoint);
}
