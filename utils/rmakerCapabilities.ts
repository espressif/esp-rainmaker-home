/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parsed RainMaker capabilities from device version info
 */
export interface RMakerCapabilities {
  /** Whether device supports assisted claiming */
  hasClaim: boolean;
  /** Whether device supports WiFi scanning */
  hasWifiScan: boolean;
  /** Whether device supports WiFi provisioning */
  hasWifiProv: boolean;
  /** Whether device requires Proof of Possession */
  requiresPop: boolean;
  /** Raw capability strings from rmaker.cap */
  rawCapabilities: string[];
}

// Capability string constants
const RMAKER_CAP = {
  CLAIM: "claim",
  WIFI_SCAN: "wifi_scan",
  WIFI_PROV: "wifi_prov",
  NO_POP: "no_pop",
} as const;

/**
 * Parses RainMaker capabilities from device version info and prov capabilities.
 *
 * @param versionInfo - The version info object from device (contains rmaker.cap)
 * @param provCapabilities - The prov capabilities array from device (contains no_pop, etc.)
 * @returns Parsed RMakerCapabilities object
 */
export function parseRMakerCapabilities(
  versionInfo: { [key: string]: any } | null | undefined,
  provCapabilities: string[] | null | undefined
): RMakerCapabilities {
  const result: RMakerCapabilities = {
    hasClaim: false,
    hasWifiScan: false,
    hasWifiProv: false,
    requiresPop: true, // Default to requiring POP
    rawCapabilities: [],
  };

  try {
    // Parse rmaker capabilities from versionInfo
    let rmakerInfo: any = null;

    if (versionInfo && typeof versionInfo === "object") {
      // Check if versionInfo is array or object
      if (Array.isArray(versionInfo)) {
        // Find rmaker object in the array
        for (const item of versionInfo) {
          if (item && typeof item === "object" && item.rmaker) {
            rmakerInfo = item.rmaker;
            break;
          }
        }
      } else {
        // Direct object access
        rmakerInfo = versionInfo.rmaker;
      }
    }

    // Extract capabilities from rmaker.cap array
    if (rmakerInfo && rmakerInfo.cap && Array.isArray(rmakerInfo.cap)) {
      const caps: string[] = rmakerInfo.cap;
      result.rawCapabilities = caps;
      result.hasClaim = caps.includes(RMAKER_CAP.CLAIM);
      result.hasWifiScan = caps.includes(RMAKER_CAP.WIFI_SCAN);
      result.hasWifiProv = caps.includes(RMAKER_CAP.WIFI_PROV);
    }

    // Check prov capabilities for no_pop
    if (provCapabilities && Array.isArray(provCapabilities)) {
      result.requiresPop = !provCapabilities.includes(RMAKER_CAP.NO_POP);
    }
  } catch (error) {
    console.error("Error parsing RMaker capabilities:", error);
  }

  return result;
}

