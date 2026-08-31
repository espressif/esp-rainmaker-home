/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** Default BLE device name prefix for ESP-IDF provisioning mode. */
export const ESP_PROV_DEVICE_PREFIX = "PROV_";

/** Primary RainMaker / custom BLE provisioning service UUID. */
export const ESP_PROV_PRIMARY_SERVICE_UUID =
  "021a9004-0382-4aea-bff4-6b3f1c5adfb4";

/** ESP-IDF default provisioning service UUID (byte-reversed 2d9bed07-…). */
export const ESP_PROV_FALLBACK_SERVICE_UUID =
  "1775244d-6b43-439b-877c-060f2d9bed07";

/** All service UUIDs attempted when connecting over Web Bluetooth. */
export const ESP_PROV_SERVICE_UUIDS = [
  ESP_PROV_PRIMARY_SERVICE_UUID,
  ESP_PROV_FALLBACK_SERVICE_UUID,
] as const;

/** ESP-IDF protocomm endpoint names. */
export const ESP_PROV_ENDPOINT_PROTO_VER = "proto-ver";
export const ESP_PROV_ENDPOINT_PROV_SESSION = "prov-session";
export const ESP_PROV_ENDPOINT_PROV_SCAN = "prov-scan";
export const ESP_PROV_ENDPOINT_PROV_CONFIG = "prov-config";
export const ESP_PROV_ENDPOINT_PROV_CTRL = "prov-ctrl";
export const ESP_PROV_ENDPOINT_CLOUD_USER_ASSOC = "cloud_user_assoc";
export const ESP_PROV_ENDPOINT_CHALLENGE_RESPONSE = "ch_resp";
export const ESP_PROV_ENDPOINT_RM_CLAIM = "rmaker_claim";

/**
 * Probe payload written to `proto-ver` before reading the response.
 * Matches native iOS/Android (`SendConfigData(..., "ESP")`).
 */
export const ESP_PROV_PROTO_VER_PROBE = "ESP";

/** GATT user description descriptor UUID (16-bit). */
export const ESP_PROV_GATT_USER_DESC_UUID = 0x2901;

/** Security scheme values from proto-ver `prov.sec_ver`. */
export const ESP_PROV_SEC_TYPE_0 = 0;
export const ESP_PROV_SEC_TYPE_1 = 1;
export const ESP_PROV_SEC_TYPE_2 = 2;

/** Default Security2 usernames (aligned with Android ESPProvModule). */
export const ESP_PROV_SEC2_USERNAME_WIFI = "wifiprov";
export const ESP_PROV_SEC2_USERNAME_THREAD = "threadprov";

/** Capability flags from proto-ver. */
export const ESP_PROV_CAPABILITY_WIFI_SCAN = "wifi_scan";
export const ESP_PROV_CAPABILITY_WIFI_PROV = "wifi_prov";
export const ESP_PROV_CAPABILITY_THREAD_SCAN = "thread_scan";
export const ESP_PROV_CAPABILITY_THREAD_PROV = "thread_prov";
export const ESP_PROV_CAPABILITY_NO_POP = "no_pop";
export const ESP_PROV_CAPABILITY_NO_SEC = "no_sec";
export const ESP_PROV_CAPABILITY_CLAIM = "claim";
export const ESP_PROV_CAPABILITY_CAMERA_CLAIM = "camera_claim";
export const ESP_PROV_CAPABILITY_CHALLENGE_RESPONSE = "ch_resp";

/** BLE scan duration for passive advertisement scan (ms). Matches native library (6s). */
export const ESP_PROV_BLE_SCAN_DURATION_MS = 6_000;

/** GATT connection timeout (ms). */
export const ESP_PROV_CONNECT_TIMEOUT_MS = 20_000;

/**
 * Short pause between Sec2 session cmd0 and cmd1 writes.
 * Chrome Web Bluetooth can reject the next write with NotSupportedError
 * immediately after a long (MTU-fragmented) cmd0 write completes.
 */
/**
 * Pause between Sec2 session cmd0 (long/reliable write) and cmd1.
 * Chrome Web Bluetooth often returns NotSupportedError on the next write if
 * this gap is too short after a prepare-write sequence.
 */
export const ESP_PROV_SESSION_STEP_DELAY_MS = 300;

/** Transport string returned to the SDK adaptor layer. */
export const ESP_PROV_TRANSPORT_BLE = "ble";
export const ESP_PROV_TRANSPORT_SOFTAP = "softap";

/** Manufacturer data key mirrored from native iOS/Android scan results. */
export const ESP_PROV_MANUFACTURER_DATA_KEY = "kCBAdvDataManufacturerData";

/** ESP RainMaker manufacturer signature bytes ("Nov"). */
export const ESP_PROV_MANUFACTURER_SIGNATURE = [0x4e, 0x6f, 0x76] as const;

/** Console prefix for Web Bluetooth provisioning debug logs. */
export const WEB_BLE_LOG_PREFIX = "[WebBLE]";
