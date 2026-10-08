/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { webNotificationManager } from "@modules/notification/web";
import { normalizeNotificationPayload } from "@shared/utils/notificationHelper";
import { configureWebNotificationClient } from "@native-adaptors/utils/webNotificationConfig";

configureWebNotificationClient();

const callbacks = new Set<(data: Record<string, unknown>) => void>();
let unsubscribeForeground: (() => void) | null = null;

/**
 * Web notification adaptor — thin bridge over `@modules/notification/web`.
 * Native Android/iOS still use `ESPNotificationAdapter.ts` + NativeModules;
 * that path can move into `@modules/notification` later.
 */
export const ESPNotificationAdapter = {
  /**
   * Adds a notification listener for foreground FCM messages.
   * @param callback - Payload handler
   * @returns Cleanup that removes this listener
   */
  addNotificationListener: async (
    callback: (data: Record<string, unknown>) => void,
  ): Promise<() => void> => {
    callbacks.add(callback);

    if (!unsubscribeForeground) {
      unsubscribeForeground = webNotificationManager.addNotificationListener(
        (data) => {
          const normalized = normalizeNotificationPayload(data);
          callbacks.forEach((cb) => {
            try {
              cb(normalized);
            } catch (err) {
              console.error("[ESPNotificationAdapter] Listener error:", err);
            }
          });
        },
      );
    }

    return () => {
      callbacks.delete(callback);
      if (callbacks.size === 0 && unsubscribeForeground) {
        unsubscribeForeground();
        unsubscribeForeground = null;
      }
    };
  },

  /**
   * Removes all adaptor listeners and the module-level foreground subscription.
   */
  removeNotificationListener: (): void => {
    callbacks.clear();
    unsubscribeForeground?.();
    unsubscribeForeground = null;
    webNotificationManager.removeNotificationListener();
  },

  /**
   * RainMaker GCM platform id (same as Android FCM).
   */
  getNotificationPlatform: async (): Promise<string> => {
    return webNotificationManager.getNotificationPlatform();
  },

  /**
   * Firebase project id used to mint the web FCM token (Neo `gcm` match).
   */
  getPushProjectId: async (): Promise<string> => {
    return webNotificationManager.getPushProjectId();
  },
};

export default ESPNotificationAdapter;
