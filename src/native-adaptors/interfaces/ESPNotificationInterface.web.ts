/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { webNotificationManager } from "@modules/notification/web";
import { configureWebNotificationClient } from "@native-adaptors/utils/webNotificationConfig";

configureWebNotificationClient();

/**
 * Web stand-in for `NativeModules.ESPNotificationModule`.
 * Backed by `@modules/notification/web` (Firebase JS SDK).
 */
const ESPNotificationModule = {
  /**
   * Requests an FCM web token (empty string when FCM cannot run).
   */
  getDeviceToken: (): Promise<string> => webNotificationManager.getDeviceToken(),

  /**
   * RainMaker GCM platform id (same as Android).
   */
  getNotificationPlatform: (): Promise<string> =>
    webNotificationManager.getNotificationPlatform(),

  /**
   * Firebase project id from the public web config.
   */
  getPushProjectId: (): Promise<string> =>
    webNotificationManager.getPushProjectId(),

  /**
   * Forwards foreground FCM payloads. Native is fire-and-forget; cleanup is unused.
   * @param callback - Payload handler
   */
  addNotificationListener: (
    callback: (data: Record<string, unknown>) => void,
  ): void => {
    webNotificationManager.addNotificationListener(callback);
  },

  /**
   * Removes all foreground listeners.
   */
  removeNotificationListener: (): void => {
    webNotificationManager.removeNotificationListener();
  },
};

export default ESPNotificationModule;
