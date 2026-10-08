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
  JSON_MIME_TYPE,
} from "@shared/utils/constants";

/** Top-level base-stack key in RainMaker Neo client-outputs JSON. */
export const RMNEO_CLIENT_OUTPUTS_BASE_KEY = "rmng-base";

/** User/auth API stack key in client-outputs JSON. */
export const RMNEO_CLIENT_OUTPUTS_USER_BASE_KEY = "espuser-base";

/**
 * Admin-dashboard stack key in client-outputs JSON.
 * Backend-published stack name (wire key); not an app SDK id.
 */
export const CLIENT_OUTPUTS_DASHBOARD_KEY = "rmng-admin-dashboard";

/** Field carrying the deployment's dashboard origin inside the stack above. */
export const CLIENT_OUTPUTS_DASHBOARD_URL_FIELD = "FrontendUrl";

/** Accepted URL scheme prefixes for Config Scan remote fetch. */
export const CONFIG_SCAN_URL_SCHEME_HTTP = "http://";
export const CONFIG_SCAN_URL_SCHEME_HTTPS = "https://";

/** Hold on camera after a hit so the guide→QR morph is visible before fetch. */
export const CONFIG_QR_LOCK_MS = 360;

/**
 * Thrown when a scanned payload is neither JSON config nor an http(s) URL.
 * Used to map the failure to the shared invalid-QR toast copy.
 */
export const CONFIG_SCAN_INVALID_PAYLOAD_ERROR =
  "Invalid scan: expected JSON configuration or an http(s) URL.";

/** JSON file extension accepted by the web config input. */
export const CONFIG_SCAN_JSON_EXTENSION = ".json";

/** @deprecated Use shared `QR_IMAGE_BARCODE_FORMAT` — kept for config callers. */
export const CONFIG_SCAN_QR_BARCODE_FORMAT = "qr_code";

/** @deprecated Use shared `QR_IMAGE_CANVAS_CONTEXT_2D` — kept for config callers. */
export const CONFIG_SCAN_CANVAS_CONTEXT_2D = "2d";

/** @deprecated Use shared `QR_IMAGE_DECODE_MAX_EDGE` — kept for config callers. */
export const CONFIG_SCAN_QR_MAX_EDGE = 1600;

/** Hidden file-input control type. */
export const CONFIG_SCAN_INPUT_TYPE_FILE = "file";

/**
 * `accept` attribute for the web config file picker (QR images + JSON).
 */
export const CONFIG_SCAN_FILE_ACCEPT = [
  IMAGE_MIME_TYPE_PNG,
  IMAGE_MIME_TYPE_JPEG,
  IMAGE_MIME_TYPE_WEBP,
  IMAGE_MIME_TYPE_GIF,
  JSON_MIME_TYPE,
  CONFIG_SCAN_JSON_EXTENSION,
].join(",");

/** Source-error codes thrown while reading a web QR image or file. */
export const CONFIG_SCAN_SOURCE_ERROR_NO_QR = "NO_QR";
export const CONFIG_SCAN_SOURCE_ERROR_UNSUPPORTED = "UNSUPPORTED_FILE";
export const CONFIG_SCAN_SOURCE_ERROR_EMPTY = "EMPTY";
export const CONFIG_SCAN_SOURCE_ERROR_CLIPBOARD_DENIED = "CLIPBOARD_DENIED";
