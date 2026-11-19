/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Storage keys for runtime config. Kept in separate file to avoid circular
 * dependency between runtimeConfig and ESPAsyncStorage.
 */
export const RUNTIME_CONFIG_STORAGE_KEYS = {
  SDK: "@esp_runtime_sdk",
  CONFIG: "@esp_runtime_config",
  /**
   * Last successfully scanned (private deployment) config, remembered
   * separately from the ACTIVE one so switching to RainMaker Classic / RainMaker Neo and back does
   * not lose it — the user can then continue with it instead of re-scanning.
   */
  PRIVATE_SDK: "@esp_private_deployment_sdk",
  PRIVATE_CONFIG: "@esp_private_deployment_config",
  /**
   * Full brand.json document for the active (usually private) deployment on web.
   * Cleared when switching to RainMaker Classic / Neo; survives logout like runtime config.
   */
  ACTIVE_BRAND_JSON: "@esp_runtime_brand_json",
} as const;
