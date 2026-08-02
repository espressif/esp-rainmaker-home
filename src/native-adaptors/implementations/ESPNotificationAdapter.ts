/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DeviceEventEmitter,
  EmitterSubscription,
} from "react-native";
import ESPNotificationModule from "../interfaces/ESPNotificationInterface";
import { normalizeNotificationPayload } from "@shared/utils/notificationHelper";

const callbacks = new Set<(data: Record<string, any>) => void>();
let emitterSubscription: EmitterSubscription | null = null;

export const ESPNotificationAdapter = {
  /**
   * Adds a notification listener to handle incoming notifications.
   * Supports multiple listeners (e.g. SDK subscription channel + app) so the last caller does not replace the previous one.
   * @param callback - The callback function to handle notifications.
   * @returns A cleanup function to remove this listener.
   */
  addNotificationListener: async (
    callback: (data: Record<string, any>) => void,
  ): Promise<() => void> => {
    try {
      callbacks.add(callback);

      if (!emitterSubscription) {
        emitterSubscription = DeviceEventEmitter.addListener(
          "ESPNotificationModule",
          (data: Record<string, any>) => {
            console.log(
              "ESPNotificationAdapter",
              "notification received",
              data,
            );
            const normalized = normalizeNotificationPayload(
              data as Record<string, unknown>,
            ) as Record<string, any>;
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
        if (callbacks.size === 0 && emitterSubscription) {
          emitterSubscription.remove();
          emitterSubscription = null;
        }
      };
    } catch {
      return () => {};
    }
  },

  /**
   * Removes the active notification listener (legacy; prefer removing via returned cleanup).
   */
  removeNotificationListener: (): void => {
    if (emitterSubscription) {
      emitterSubscription.remove();
      emitterSubscription = null;
    }
    callbacks.clear();
  },

  getNotificationPlatform: async (): Promise<string> => {
    try {
      const platform = await ESPNotificationModule.getNotificationPlatform();
      return platform;
    } catch (error) {
      console.error("Error getting notification platform:", error);
      throw error;
    }
  },

  /**
   * Returns the Firebase project id backing this build's FCM token (Android),
   * used to select the correct RainMaker Neo `gcm` push integration. Resolves "" when
   * the native method is unavailable (iOS / CN build / older native binary) so
   * callers can fall back to build-time config.
   */
  getPushProjectId: async (): Promise<string> => {
    try {
      const projectId = await ESPNotificationModule.getPushProjectId?.();
      return typeof projectId === "string" ? projectId : "";
    } catch (error) {
      console.warn("Error getting push project id:", error);
      return "";
    }
  },
};
