/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// Define the interface for the native module
import { NativeModules } from "react-native";
const { ESPNotificationModule } = NativeModules;

interface ESPNotificationInterface {
  /**
   * Retrieves the device token from the ESP notification module.
   * @returns Promise<string> - The device token.
   */
  getDeviceToken(): Promise<string>;

  /**
   * Retrieves the notification platform from the ESP notification module.
   * @returns Promise<string> - The notification platform.
   */
  getNotificationPlatform(): Promise<string>;

  /**
   * Adds a notification listener to the ESP notification module.
   * @param callback - The callback function to handle the notification.
   */
  addNotificationListener(callback: Function): void;

  /**
   * Removes a notification listener from the ESP notification module.
   */
  removeNotificationListener(): void;
}

export default ESPNotificationModule as ESPNotificationInterface;
