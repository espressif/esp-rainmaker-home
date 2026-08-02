/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Progress `description` strings emitted by RainMaker / RainMaker Neo SDK
 * `runChallengeResponseProvisionFlow` (BLE / SoftAP chal-resp).
 *
 * These must stay in sync with `@espressif/rainmaker-base-sdk` /
 * `@espressif/rainmaker-neo-base-sdk` `ESPProvProgressMessages`. CDF's
 * `ESPCDFProvProgressMessages` only covers the MQTT association path, so
 * chal-resp strings live here for the provision UI stage map.
 *
 * Protocol order (app ↔ firmware `ch_resp` endpoint + network_prov):
 * 1. Initiate cloud mapping → challenge
 * 2. Relay challenge to device (`ch_resp`) → signed response + node_id
 * 3. Cloud verifies mapping
 * 4. Apply Wi-Fi credentials via provision adapter
 * 5. (RainMaker Neo optional) wait for node online
 * 6. Succeed with nodeId
 */
export const CHAL_RESP_PROGRESS_MESSAGES = {
  INITIATING_NODE_ASSOCIATION: "Initiating node association...",
  SENDING_CHALLENGE_TO_DEVICE: "Sending challenge to device...",
  VERIFYING_NODE_ASSOCIATION: "Verifying node association...",
  SETTING_NETWORK_CREDENTIALS: "Setting network credentials...",
  WAITING_FOR_ONLINE: "Waiting for device to come online...",
} as const;
