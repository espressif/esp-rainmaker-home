/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IMAGE_MIME_TYPE_GIF,
  IMAGE_MIME_TYPE_JPEG,
  IMAGE_MIME_TYPE_PNG,
  IMAGE_MIME_TYPE_WEBP,
} from "@shared/utils/constants";

/** Default BLE advertised name prefix for ESP-IDF provisioning devices */
export const DEFAULT_PROVISION_DEVICE_PREFIX = "PROV_";

/** DOM id for the web BLE spinner keyframes style tag */
export const WEB_BLE_SPIN_STYLE_ID = "web-ble-scan-spin-keyframes";
/** CSS keyframes name for the web BLE scan/connect spinner */
export const WEB_BLE_SPIN_KEYFRAMES_NAME = "webBleScanSpin";
/** CSS duration for one web BLE spinner rotation */
export const WEB_BLE_SPIN_DURATION = "0.8s";
/** CSS timing function for the web BLE spinner */
export const WEB_BLE_SPIN_TIMING = "linear";
/** CSS iteration count for the web BLE spinner */
export const WEB_BLE_SPIN_ITERATION = "infinite";

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

/** Hidden file-input control type for web QR upload. */
export const PROVISION_QR_INPUT_TYPE_FILE = "file";

/**
 * `accept` attribute for the web provision QR file picker (images only).
 */
export const PROVISION_QR_FILE_ACCEPT = [
  IMAGE_MIME_TYPE_PNG,
  IMAGE_MIME_TYPE_JPEG,
  IMAGE_MIME_TYPE_WEBP,
  IMAGE_MIME_TYPE_GIF,
].join(",");

/** Source-error codes thrown while reading a web provision QR image or text. */
export const PROVISION_QR_SOURCE_ERROR_NO_QR = "NO_QR";
export const PROVISION_QR_SOURCE_ERROR_UNSUPPORTED = "UNSUPPORTED_FILE";
export const PROVISION_QR_SOURCE_ERROR_EMPTY = "EMPTY";
export const PROVISION_QR_SOURCE_ERROR_CLIPBOARD_DENIED = "CLIPBOARD_DENIED";

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
