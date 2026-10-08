/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Browser entry for `@modules/notification/web` — Firebase Cloud Messaging.
 */

export { webNotificationManager } from "./messaging";
export {
  FIREBASE_JS_COMPAT_VERSION,
  FIREBASE_MESSAGING_SW_PATH,
  WEB_NOTIFICATION_PLATFORM,
  FCM_PAYLOAD_KEY_TITLE,
  FCM_PAYLOAD_KEY_BODY,
} from "./constants";
export type {
  EspNotificationClient,
  EspNotificationFirebaseWebConfig,
  EspNotificationHandler,
} from "../src/types";
