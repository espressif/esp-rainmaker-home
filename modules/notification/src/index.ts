/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Public API for `@modules/notification`.
 *
 * Web FCM lives under `@modules/notification/web`. Native Android/iOS still
 * use `NativeModules.ESPNotificationModule`; migrate that implementation into
 * this package when the Expo native module is added.
 */

export type {
  EspNotificationClient,
  EspNotificationFirebaseWebConfig,
  EspNotificationHandler,
} from "./types";
