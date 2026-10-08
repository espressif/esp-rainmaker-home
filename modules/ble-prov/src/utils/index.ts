/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

export {
  enrichVersionInfoWithGattEndpoints,
  parseProvSecVer,
  deviceRequiresProofOfPossession,
  deviceSupportsAssistedClaiming,
  gattEndpointsIncludeChallengeResponse,
} from "./capabilityResolution";

export {
  PROVISION_FLOW_STEP,
  ESP_PROV_NATIVE_BLE_SCAN_DURATION_MS,
  bleScanResultPassesManufacturerGate,
} from "./provisionFlow";
