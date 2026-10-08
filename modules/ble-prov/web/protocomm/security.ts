/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Security0, Security1, Security2 } from "esp-ble-prov";

import {
  ESP_PROV_CAPABILITY_THREAD_PROV,
  ESP_PROV_CAPABILITY_THREAD_SCAN,
  ESP_PROV_CAPABILITY_WIFI_PROV,
  ESP_PROV_CAPABILITY_WIFI_SCAN,
  ESP_PROV_SEC2_USERNAME_THREAD,
  ESP_PROV_SEC2_USERNAME_WIFI,
  ESP_PROV_SEC_TYPE_0,
  ESP_PROV_SEC_TYPE_1,
  ESP_PROV_SEC_TYPE_2,
} from "@modules/ble-prov";

/**
 * Picks the Security2 username based on device capabilities (Android parity).
 * @param capabilities - Device capability strings from proto-ver
 * @param explicitUsername - Username provided by the caller, if any
 * @returns SRP username for Security2
 */
export function resolveSec2Username(
  capabilities: string[],
  explicitUsername?: string,
): string {
  if (explicitUsername) {
    return explicitUsername;
  }

  if (
    capabilities.includes(ESP_PROV_CAPABILITY_THREAD_SCAN) ||
    capabilities.includes(ESP_PROV_CAPABILITY_THREAD_PROV)
  ) {
    return ESP_PROV_SEC2_USERNAME_THREAD;
  }

  if (
    capabilities.includes(ESP_PROV_CAPABILITY_WIFI_SCAN) ||
    capabilities.includes(ESP_PROV_CAPABILITY_WIFI_PROV)
  ) {
    return ESP_PROV_SEC2_USERNAME_WIFI;
  }

  return ESP_PROV_SEC2_USERNAME_WIFI;
}

/**
 * Builds the Web Bluetooth security handler for the negotiated scheme.
 * @param securityType - Security type from proto-ver (0, 1, or 2)
 * @param proofOfPossession - PoP string for Security1/2
 * @param username - Username for Security2
 * @param capabilities - Device capabilities used to pick a default username
 * @returns Security handler instance
 */
export function createSecurityHandler(
  securityType: number,
  proofOfPossession: string,
  username?: string,
  capabilities: string[] = [],
): Security0 | Security1 | Security2 {
  switch (securityType) {
    case ESP_PROV_SEC_TYPE_0:
      return new Security0();
    case ESP_PROV_SEC_TYPE_1:
      return new Security1(
        proofOfPossession ? { pop: proofOfPossession } : undefined,
      );
    case ESP_PROV_SEC_TYPE_2:
      return new Security2({
        username: resolveSec2Username(capabilities, username),
        password: proofOfPossession,
      });
    default:
      return new Security1(
        proofOfPossession ? { pop: proofOfPossession } : undefined,
      );
  }
}

/**
 * Maps a requested security level to a default handler before proto-ver is read.
 * @param securityType - Requested security level from createESPDevice
 * @param proofOfPossession - Optional PoP
 * @returns Initial security handler
 */
export function createInitialSecurityHandler(
  securityType: number,
  proofOfPossession?: string,
): Security0 | Security1 | Security2 {
  if (securityType === ESP_PROV_SEC_TYPE_0) {
    return new Security0();
  }

  return new Security1(
    proofOfPossession ? { pop: proofOfPossession } : undefined,
  );
}
