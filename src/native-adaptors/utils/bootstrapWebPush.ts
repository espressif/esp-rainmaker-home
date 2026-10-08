/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Platform } from "react-native";
import {
  FCM_PAYLOAD_KEY_BODY,
  FCM_PAYLOAD_KEY_TITLE,
  webNotificationManager,
} from "@modules/notification/web";
import { normalizeNotificationPayload } from "@shared/utils/notificationHelper";
import { PLATFORM_WEB } from "@shared/utils/constants";

/** FCM data key for RainMaker Neo / legacy event JSON payload. */
const FCM_DATA_KEY_EVENT_DATA_PAYLOAD = "event_data_payload";

/** FCM data key for legacy RainMaker event JSON payload. */
const FCM_DATA_KEY_EVENT_DATA = "event_data";

/** Default notification title when the payload omits one. */
const WEB_PUSH_DEFAULT_TITLE = "ESP RainMaker Home";

let bootstrapStarted = false;
let unsubscribeBootstrap: (() => void) | null = null;

/**
 * Reads a string field from a normalized FCM data map.
 * @param data - Normalized notification payload
 * @param key - Data key
 */
function readStringField(
  data: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = data[key];
  return typeof value === "string" && value ? value : undefined;
}

/**
 * Shows a foreground browser notification when permission is granted.
 * FCM does not auto-display notifications while the tab is focused.
 * @param data - Normalized FCM payload
 */
function showForegroundBrowserNotification(
  data: Record<string, unknown>,
): void {
  if (typeof Notification === "undefined") {
    return;
  }
  if (Notification.permission !== "granted") {
    return;
  }
  const title =
    readStringField(data, FCM_PAYLOAD_KEY_TITLE) ??
    readStringField(data, "title") ??
    WEB_PUSH_DEFAULT_TITLE;
  const body =
    readStringField(data, FCM_PAYLOAD_KEY_BODY) ??
    readStringField(data, "body") ??
    "";
  try {
    new Notification(title, { body, icon: "/favicon.ico" });
  } catch (error) {
    console.warn("[bootstrapWebPush] Foreground notification failed:", error);
  }
}

/**
 * Attaches the web FCM foreground listener as soon as Firebase config is applied.
 * Uses {@link webNotificationManager} directly to avoid a circular import with
 * `ESPNotificationAdapter` during module initialization.
 * Without this, `onMessage()` is only wired when the SDK notification channel
 * subscribes (after a delayed node sync), so early pushes are dropped.
 */
export function bootstrapWebPushDelivery(): void {
  if (Platform.OS !== PLATFORM_WEB || bootstrapStarted) {
    return;
  }
  bootstrapStarted = true;

  unsubscribeBootstrap = webNotificationManager.addNotificationListener((raw) => {
    const data = normalizeNotificationPayload(raw);
    const hasRainMakerPayload =
      readStringField(data, FCM_DATA_KEY_EVENT_DATA_PAYLOAD) != null ||
      readStringField(data, FCM_DATA_KEY_EVENT_DATA) != null ||
      readStringField(data, FCM_PAYLOAD_KEY_TITLE) != null ||
      readStringField(data, FCM_PAYLOAD_KEY_BODY) != null;

    if (hasRainMakerPayload) {
      showForegroundBrowserNotification(data);
    }
  });
}

/**
 * Removes the bootstrap foreground listener (e.g. on logout).
 */
export function teardownWebPushDelivery(): void {
  unsubscribeBootstrap?.();
  unsubscribeBootstrap = null;
  bootstrapStarted = false;
}
