/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceEventEmitter, EmitterSubscription } from "react-native";
import ESPNotificationModule from "../interfaces/ESPNotificationInterface";

export const ESPNotificationAdapter = {
  // Maintain a reference to the current listener
  currentListener: null as EmitterSubscription | null,

  /**
   * Adds a notification listener to handle incoming notifications.
   *
   * @param {(data: Record<string, any>) => void} callback - The callback function to handle notifications.
   * @returns {() => void} A cleanup function to remove the listener.
   */
  addNotificationListener: async (
    callback: (data: Record<string, any>) => void
  ): Promise<() => void> => {
    try {
      if (ESPNotificationAdapter.currentListener) {
        ESPNotificationAdapter.removeNotificationListener();
      }

      // Listen for incoming notifications and handle them
      const notificationListener = DeviceEventEmitter.addListener(
        "ESPNotificationModule",
        (data: Record<string, any>) => {
          callback(data); // Invoke the callback with the received data
        }
      );

      // Save listener reference for removal
      ESPNotificationAdapter.currentListener = notificationListener;

      // Return a cleanup function to remove the notification listener
      return () => {
        ESPNotificationAdapter.removeNotificationListener();
      };
    } catch (error) {
      return () => {}; // Return a no-op cleanup function in case of an error
    }
  },

  /**
   * Removes the active notification listener.
   */
  removeNotificationListener: (): void => {
    try {
      if (ESPNotificationAdapter.currentListener) {
        ESPNotificationAdapter.currentListener.remove();
        ESPNotificationAdapter.currentListener = null;
      }
    } catch (error) {
      throw error;
    }
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
};
