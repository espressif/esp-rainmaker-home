/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

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
