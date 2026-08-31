/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { deviceRequiresProofOfPossession } from "@integrations/bleProvCapabilities";

/**
 * Parsed RainMaker capabilities from device version info
 */
export interface RMakerCapabilities {
  /** Whether device supports assisted claiming (either "claim" or "camera_claim") */
  hasClaim: boolean;
  /** Whether device supports camera-specific assisted claiming */
  hasCameraClaim: boolean;
  /** Whether device supports WiFi scanning */
  hasWifiScan: boolean;
  /** Whether device supports WiFi provisioning */
  hasWifiProv: boolean;
  /** Whether device requires Proof of Possession */
  requiresPop: boolean;
  /** Raw capability strings from rmaker.cap */
  rawCapabilities: string[];
}

const RMAKER_CAP = {
  CLAIM: "claim",
  CAMERA_CLAIM: "camera_claim",
  WIFI_SCAN: "wifi_scan",
  WIFI_PROV: "wifi_prov",
} as const;

/**
 * Parses RainMaker capabilities from device version info and prov capabilities.
 * @param versionInfo - The version info object from device (contains rmaker.cap)
 * @param provCapabilities - The prov capabilities array from device (contains no_pop, etc.)
 * @returns Parsed RMakerCapabilities object
 */
export function parseRMakerCapabilities(
  versionInfo: { [key: string]: any } | { [key: string]: any }[] | null | undefined,
  provCapabilities: string[] | null | undefined
): RMakerCapabilities {
  const result: RMakerCapabilities = {
    hasClaim: false,
    hasCameraClaim: false,
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
      result.hasCameraClaim = caps.includes(RMAKER_CAP.CAMERA_CLAIM);
      result.hasClaim = caps.includes(RMAKER_CAP.CLAIM) || result.hasCameraClaim;
      result.hasWifiScan = caps.includes(RMAKER_CAP.WIFI_SCAN);
      result.hasWifiProv = caps.includes(RMAKER_CAP.WIFI_PROV);
    }

    // Check prov capabilities for no_pop and Security0 (shared parity with native)
    const versionRecord =
      versionInfo && typeof versionInfo === "object" && !Array.isArray(versionInfo)
        ? versionInfo
        : Array.isArray(versionInfo)
          ? versionInfo.find((item) => item && typeof item === "object")
          : null;
    result.requiresPop = deviceRequiresProofOfPossession(
      versionRecord as { prov?: { sec_ver?: number } } | null,
      provCapabilities ?? [],
    );
  } catch (error) {
    console.error("Error parsing RMaker capabilities:", error);
  }

  return result;
}

