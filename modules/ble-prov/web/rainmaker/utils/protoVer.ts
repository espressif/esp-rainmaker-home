/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPProvisioner } from "esp-ble-prov";

import {
  ESP_PROV_CAPABILITY_NO_SEC,
  ESP_PROV_ENDPOINT_PROTO_VER,
  ESP_PROV_PROTO_VER_PROBE,
  ESP_PROV_SEC_TYPE_0,
  ESP_PROV_SEC_TYPE_1,
  parseProvSecVer,
  type EspProtoVerInfo,
} from "@modules/ble-prov";

/**
 * Reads and parses the plaintext `proto-ver` endpoint from a connected device.
 *
 * Matches native iOS/Android: write the `"ESP"` probe, then read the JSON
 * response so `prov.sec_ver` / capabilities are populated.
 * @param provisioner - Active BLE provisioner with an established GATT connection
 * @returns Parsed version and capability JSON
 */
export async function readProtoVer(
  provisioner: ESPProvisioner,
): Promise<EspProtoVerInfo> {
  const probe = new TextEncoder().encode(ESP_PROV_PROTO_VER_PROBE);

  try {
    await provisioner.writeValue(ESP_PROV_ENDPOINT_PROTO_VER, probe);
  } catch {
    // Some firmwares expose a readable proto-ver value without a probe write.
  }

  const response = await provisioner.readValue(ESP_PROV_ENDPOINT_PROTO_VER);
  const text = new TextDecoder().decode(response).trim();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as EspProtoVerInfo;
  } catch {
    throw new Error("Invalid proto-ver JSON from device");
  }
}

/**
 * Extracts provisioning capability strings from parsed proto-ver data.
 * @param versionInfo - Parsed proto-ver payload
 * @returns Capability list from `prov.cap`
 */
export function getCapabilitiesFromProtoVer(
  versionInfo: EspProtoVerInfo,
): string[] {
  const caps = versionInfo.prov?.cap;
  return Array.isArray(caps) ? caps : [];
}

/**
 * Resolves the security scheme advertised by the device.
 *
 * When `sec_ver` is absent from `proto-ver` (older/minimal firmware), this
 * mirrors Android (`ESPProvModule.setSecurityTypeFromVersionInfo`) and iOS
 * (`ESPDevice.initialiseSession`), which never fall back to Security2 — only
 * Security0 (via the `no_sec` capability) or Security1.
 * @param versionInfo - Parsed proto-ver payload
 * @param capabilities - `prov.cap` strings from the device
 * @returns Numeric security type (0, 1, or 2)
 */
export function getSecurityFromProtoVer(
  versionInfo: EspProtoVerInfo,
  capabilities: string[],
): number {
  const secVer = parseProvSecVer(versionInfo.prov?.sec_ver);
  if (secVer !== undefined) {
    return secVer;
  }

  return capabilities.includes(ESP_PROV_CAPABILITY_NO_SEC)
    ? ESP_PROV_SEC_TYPE_0
    : ESP_PROV_SEC_TYPE_1;
}
