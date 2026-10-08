/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Minimal public Firebase config for Cloud Messaging only, plus the Web Push
 * VAPID public key used by `getToken`. Auth / Storage fields are not required.
 */
export interface EspNotificationFirebaseWebConfig {
  /** Firebase web API key. */
  apiKey: string;
  /** Firebase project id — must match the RainMaker Neo `gcm` integration. */
  projectId: string;
  /** FCM sender id. */
  messagingSenderId: string;
  /** Firebase web app id (`1:…:web:…`). */
  appId: string;
  /** Web Push certificate public VAPID key (passed to `getToken`, not initializeApp). */
  vapidKey: string;
}

/** Callback for a foreground (or forwarded) push payload. */
export type EspNotificationHandler = (
  data: Record<string, unknown>,
) => void;

/**
 * Platform-agnostic notification client.
 * Web implements this with Firebase JS; native will wrap ESPNotificationModule later.
 */
export interface EspNotificationClient {
  /**
   * Returns the FCM (or APNs) device token, or `""` when unavailable.
   */
  getDeviceToken(): Promise<string>;
  /**
   * RainMaker platform identifier (e.g. `GCM_NOVA`).
   */
  getNotificationPlatform(): Promise<string>;
  /**
   * Firebase project id that minted the token, or `""` when unknown.
   */
  getPushProjectId(): Promise<string>;
  /**
   * Subscribes to foreground notification payloads.
   * @returns Unsubscribe function
   */
  addNotificationListener(callback: EspNotificationHandler): () => void;
  /**
   * Removes all notification listeners.
   */
  removeNotificationListener(): void;
}
