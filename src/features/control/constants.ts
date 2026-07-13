/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** i18n key for the empty state when a device control panel has no parameters. */
export const I18N_DEVICE_CONTROL_FALLBACK_NO_PARAMS = "device.control.fallbackNoParams";

/** Settings quick-action tile ids (horizontal row after node info). */
export const SETTINGS_QUICK_ACTION_AUTH_TOKEN = "auth_token";
export const SETTINGS_QUICK_ACTION_DEVICE_LIST = "device_list";

/** Settings screen section keys (visibility toggles in {@link useSettings}). */
export const SETTINGS_SECTION_NAME = "name";

/** Outcomes returned by {@link saveDeviceDisplayName}. */
export const SAVE_DEVICE_NAME_STATUS_SUCCESS = "success";
export const SAVE_DEVICE_NAME_STATUS_NO_PARAM = "no_param";
export const SAVE_DEVICE_NAME_STATUS_FAILED = "failed";

/** Toast categories for RainMaker user-auth update results. */
export const RMAKER_AUTH_TOAST_KIND_UPDATED = "updated";
export const RMAKER_AUTH_TOAST_KIND_NO_REFRESH_TOKEN = "no_refresh_token";
export const RMAKER_AUTH_TOAST_KIND_FAILED = "failed";
