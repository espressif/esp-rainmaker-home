/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** Same RainMaker platform id as Android FCM (`ESPNotificationModule`). */
export const WEB_NOTIFICATION_PLATFORM = "GCM_NOVA";

/**
 * Origin-relative Firebase Messaging service worker path.
 * `deploy:web` rewrites the exact form `="/firebase-messaging-sw.js"` in
 * built HTML/JS/CSS/JSON files under `dist/` to
 * `="/web/<env>/<region>/<version>/firebase-messaging-sw.js"` — enough to
 * catch the standard `serviceWorker.register(FIREBASE_MESSAGING_SW_PATH, …)`
 * call site after bundling, but not minified or single-quoted variants of
 * the same string. Registration scope must stay under that directory
 * (not `/`).
 */
export const FIREBASE_MESSAGING_SW_PATH = "/firebase-messaging-sw.js";

/** Compat SDK version loaded by the generated service worker (matches `firebase` npm). */
export const FIREBASE_JS_COMPAT_VERSION = "12.17.1";

/** `Notification.permission` / `requestPermission()` granted value. */
export const NOTIFICATION_PERMISSION_GRANTED = "granted";

/** FCM data / notification title field. */
export const FCM_PAYLOAD_KEY_TITLE = "title";

/** FCM data / notification body field. */
export const FCM_PAYLOAD_KEY_BODY = "body";
