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

/** Expo Router path for the QR scanner screen. */
export const PROVISION_SCAN_QR_ROUTE = "/(provision)/ScanQR";
/** Expo Router path for add-device selection / secondary-user gate. */
export const PROVISION_ADD_DEVICE_SELECTION_ROUTE =
  "/(provision)/AddDeviceSelection";

/** Permission UI: still waiting on the OS prompt / initial check. */
export const PERMISSION_UI_STATUS_REQUESTING = "requesting";
/** Permission UI: user denied or permanently blocked access. */
export const PERMISSION_UI_STATUS_DENIED = "denied";

/**
 * iOS CAGradientLayer treats CSS `transparent` as black — use white @ 0 alpha
 * for LinearGradient clear stops (ConnectingStatusFooter shimmer).
 */
export const GRADIENT_WHITE_CLEAR = "rgba(255,255,255,0)";
/** Soft white highlight for shimmer mid stops. */
export const GRADIENT_WHITE_SOFT = "rgba(255,255,255,0.85)";
