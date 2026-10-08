/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESP_PROV_CAPABILITY_CHALLENGE_RESPONSE,
  ESP_PROV_CAPABILITY_CLAIM,
  ESP_PROV_CAPABILITY_NO_POP,
  ESP_PROV_CAPABILITY_WIFI_PROV,
  ESP_PROV_CAPABILITY_WIFI_SCAN,
  ESP_PROV_ENDPOINT_CHALLENGE_RESPONSE,
  ESP_PROV_ENDPOINT_PROV_CONFIG,
  ESP_PROV_ENDPOINT_PROV_SCAN,
  ESP_PROV_ENDPOINT_RM_CLAIM,
  ESP_PROV_SEC_TYPE_0,
} from "./constants";
import type { EspProtoVerInfo } from "../types/types";

/** Maps a discovered GATT endpoint to RainMaker / prov capability strings. */
const GATT_ENDPOINT_CAPABILITY_MAP: ReadonlyArray<{
  endpoint: string;
  rmakerCap?: string;
  rmakerExtraCap?: string;
  provCap?: string;
}> = [
  {
    endpoint: ESP_PROV_ENDPOINT_RM_CLAIM,
    rmakerCap: ESP_PROV_CAPABILITY_CLAIM,
  },
  {
    endpoint: ESP_PROV_ENDPOINT_CHALLENGE_RESPONSE,
    rmakerCap: ESP_PROV_CAPABILITY_CHALLENGE_RESPONSE,
    rmakerExtraCap: ESP_PROV_CAPABILITY_CHALLENGE_RESPONSE,
  },
  {
    endpoint: ESP_PROV_ENDPOINT_PROV_SCAN,
    rmakerCap: ESP_PROV_CAPABILITY_WIFI_SCAN,
    provCap: ESP_PROV_CAPABILITY_WIFI_SCAN,
  },
  {
    endpoint: ESP_PROV_ENDPOINT_PROV_CONFIG,
    rmakerCap: ESP_PROV_CAPABILITY_WIFI_PROV,
    provCap: ESP_PROV_CAPABILITY_WIFI_PROV,
  },
];

/**
 * Appends a capability string to a list when not already present.
 * @param caps - Existing capability list
 * @param value - Capability to add
 * @returns Merged capability list
 */
function appendCapability(caps: string[], value: string): string[] {
  return caps.includes(value) ? caps : [...caps, value];
}

/**
 * Merges GATT-discovered protocomm endpoints into proto-ver so all platforms
 * expose the same `rmaker.cap` / `rmaker_extra.cap` metadata to the SDK and UI.
 * @param versionInfo - Parsed proto-ver JSON (may be empty on web)
 * @param endpointNames - Discovered protocomm endpoint names from GATT descriptors
 * @returns Version info enriched from GATT endpoint mapping
 */
export function enrichVersionInfoWithGattEndpoints(
  versionInfo: EspProtoVerInfo,
  endpointNames: string[],
): EspProtoVerInfo {
  const enriched: EspProtoVerInfo = { ...versionInfo };
  const endpointSet = new Set(endpointNames);

  let rmakerCaps = Array.isArray(enriched.rmaker?.cap) ? [...enriched.rmaker.cap] : [];
  let rmakerExtraCaps = Array.isArray(enriched.rmaker_extra?.cap)
    ? [...enriched.rmaker_extra.cap]
    : [];
  let provCaps = Array.isArray(enriched.prov?.cap) ? [...enriched.prov.cap] : [];

  for (const mapping of GATT_ENDPOINT_CAPABILITY_MAP) {
    if (!endpointSet.has(mapping.endpoint)) {
      continue;
    }
    if (mapping.rmakerCap) {
      rmakerCaps = appendCapability(rmakerCaps, mapping.rmakerCap);
    }
    if (mapping.rmakerExtraCap) {
      rmakerExtraCaps = appendCapability(rmakerExtraCaps, mapping.rmakerExtraCap);
    }
    if (mapping.provCap) {
      provCaps = appendCapability(provCaps, mapping.provCap);
    }
  }

  if (rmakerCaps.length > 0) {
    enriched.rmaker = {
      ...(enriched.rmaker && typeof enriched.rmaker === "object" ? enriched.rmaker : {}),
      cap: rmakerCaps,
    };
  }

  if (rmakerExtraCaps.length > 0) {
    enriched.rmaker_extra = {
      ...(enriched.rmaker_extra && typeof enriched.rmaker_extra === "object"
        ? enriched.rmaker_extra
        : {}),
      cap: rmakerExtraCaps,
    };
  }

  if (provCaps.length > 0) {
    enriched.prov = {
      ...(enriched.prov && typeof enriched.prov === "object" ? enriched.prov : {}),
      cap: provCaps,
    };
  }

  return enriched;
}

/**
 * Coerces proto-ver `prov.sec_ver` to a finite number when present.
 * @param raw - Value from parsed JSON (`number`, numeric `string`, or other)
 * @returns Finite security type, or `undefined` when absent/invalid
 */
export function parseProvSecVer(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

/**
 * Returns whether the device requires a Proof-of-Possession step before session init.
 * Matches Android/iOS `prov.cap` (`no_pop`) and Security0 (`sec_ver` 0) behavior.
 * @param versionInfo - Parsed proto-ver JSON
 * @param provCapabilities - `prov.cap` strings from the device
 * @returns True when the POP screen should be shown
 */
export function deviceRequiresProofOfPossession(
  versionInfo: EspProtoVerInfo | Record<string, unknown> | null | undefined,
  provCapabilities: string[],
): boolean {
  const secVer = parseProvSecVer(
    (versionInfo as EspProtoVerInfo | null | undefined)?.prov?.sec_ver,
  );
  if (secVer === ESP_PROV_SEC_TYPE_0) {
    return false;
  }
  return !provCapabilities.includes(ESP_PROV_CAPABILITY_NO_POP);
}

/**
 * Returns whether assisted claiming should run before Wi-Fi provisioning.
 * @param versionInfo - Parsed proto-ver JSON (may be GATT-enriched on web)
 * @returns True when `rmaker.cap` includes `claim`
 */
export function deviceSupportsAssistedClaiming(
  versionInfo: EspProtoVerInfo | Record<string, unknown> | null | undefined,
): boolean {
  const rmakerCap = (versionInfo as EspProtoVerInfo | null | undefined)?.rmaker?.cap;
  return Array.isArray(rmakerCap) && rmakerCap.includes(ESP_PROV_CAPABILITY_CLAIM);
}

/**
 * Returns whether the `ch_resp` GATT endpoint was discovered.
 * @param endpointNames - Discovered protocomm endpoint names
 * @returns True when challenge-response flow is available over BLE
 */
export function gattEndpointsIncludeChallengeResponse(
  endpointNames: string[],
): boolean {
  return endpointNames.includes(ESP_PROV_ENDPOINT_CHALLENGE_RESPONSE);
}
