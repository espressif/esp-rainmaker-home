/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Constants from "expo-constants";
import {
  webNotificationManager,
  type EspNotificationFirebaseWebConfig,
} from "@modules/notification/web";
import { bootstrapWebPushDelivery } from "./bootstrapWebPush";

/** Expo `extra` key for the public Firebase web client config. */
export const EXPO_EXTRA_FIREBASE_WEB_KEY = "firebaseWeb";

/**
 * Reads public Firebase Messaging config from Expo extra (`.env.web` via app.config).
 * @returns Config when all messaging fields are set, otherwise `null`
 */
export function readExpoFirebaseWebConfig(): EspNotificationFirebaseWebConfig | null {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const raw = extra[EXPO_EXTRA_FIREBASE_WEB_KEY];
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const config = raw as Record<string, unknown>;
  const apiKey = typeof config.apiKey === "string" ? config.apiKey : "";
  const projectId =
    typeof config.projectId === "string" ? config.projectId : "";
  const messagingSenderId =
    typeof config.messagingSenderId === "string"
      ? config.messagingSenderId
      : "";
  const appId = typeof config.appId === "string" ? config.appId : "";
  const vapidKey = typeof config.vapidKey === "string" ? config.vapidKey : "";
  if (!apiKey || !projectId || !messagingSenderId || !appId || !vapidKey) {
    return null;
  }
  return { apiKey, projectId, messagingSenderId, appId, vapidKey };
}

/**
 * Passes env-backed Firebase config into the web notification client.
 */
export function configureWebNotificationClient(): void {
  const config = readExpoFirebaseWebConfig();
  if (config) {
    webNotificationManager.configure(config);
    bootstrapWebPushDelivery();
  }
}
