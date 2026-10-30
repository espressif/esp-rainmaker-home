/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sensitive permission groups the app can ask for.
 *
 * Every value maps to a `permissions.purposes.<value>` block in the locale
 * files that states the permission name, the feature it unlocks and what the
 * data is used for. Add a new value only together with its copy in
 * `locales/en.json` and `locales/zh.json`.
 */
/**
 * Bluetooth + location for adding a device, on the BLE and SoftAP paths alike:
 * the native `requestAllPermissions()` asks for the whole set in one go, and
 * the dialog must describe what is actually requested.
 */
export const PERMISSION_PURPOSE_BLE_AND_LOCATION = "bleAndLocation" as const;
/** Camera for QR scanning (provision, config, agent settings). */
export const PERMISSION_PURPOSE_CAMERA = "camera" as const;
/** Camera for taking a photo to attach to an agent chat message (it is uploaded). */
export const PERMISSION_PURPOSE_CHAT_CAMERA = "chatCamera" as const;
export const PERMISSION_PURPOSE_MICROPHONE = "microphone" as const;
export const PERMISSION_PURPOSE_PHOTOS = "photos" as const;
export const PERMISSION_PURPOSE_NOTIFICATIONS = "notifications" as const;

export type PermissionPurpose =
  | typeof PERMISSION_PURPOSE_BLE_AND_LOCATION
  | typeof PERMISSION_PURPOSE_CAMERA
  | typeof PERMISSION_PURPOSE_CHAT_CAMERA
  | typeof PERMISSION_PURPOSE_MICROPHONE
  | typeof PERMISSION_PURPOSE_PHOTOS
  | typeof PERMISSION_PURPOSE_NOTIFICATIONS;
