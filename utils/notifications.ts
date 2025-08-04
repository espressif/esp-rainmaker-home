/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// Third-party imports
import { CDF } from "@espressif/rainmaker-base-cdf";
import { ESPRMEventType } from "@espressif/rainmaker-base-sdk";

// Local imports
import ESPNotificationModule from "@/adaptors/interfaces/ESPNotificationInterface";

// Types
interface PlatformEndpointConfig {
  platform: string;
  deviceToken: string;
}

// Constants
const ERROR_MESSAGES = {
  MODULE_NOT_AVAILABLE: "ESPNotificationModule is not available",
  FETCH_PLATFORM_FAILED: "Failed to fetch notification platform",
  FETCH_TOKEN_FAILED: "Failed to get FCM token",
  CREATE_ENDPOINT_FAILED: "Failed to create platform endpoint",
  DELETE_ENDPOINT_FAILED: "Failed to delete platform endpoint",
} as const;

/**
 * Utility function to check if notification module is available
 * @returns boolean - True if module is available, false otherwise
 */
export const isNotificationModuleAvailable = (): boolean => {
  return !!ESPNotificationModule;
};

/**
 * Fetches the notification platform from the ESP notification module
 * @returns Promise<string | null> - The platform name or null if not available
 * @throws Error - When platform fetching fails
 */
export const fetchPlatform = async (): Promise<string | null> => {
  if (!ESPNotificationModule) {
    console.warn(ERROR_MESSAGES.MODULE_NOT_AVAILABLE);
    return null;
  }

  try {
    return await ESPNotificationModule.getNotificationPlatform();
  } catch (error) {
    console.error("Error fetching notification platform:", error);
    throw new Error(ERROR_MESSAGES.FETCH_PLATFORM_FAILED);
  }
};

/**
 * Fetches the device token from the ESP notification module
 * @returns Promise<string | null> - The device token or null if not available
 * @throws Error - When token fetching fails
 */
export const fetchDeviceToken = async (): Promise<string | null> => {
  if (!ESPNotificationModule) {
    console.warn(ERROR_MESSAGES.MODULE_NOT_AVAILABLE);
    return null;
  }

  try {
    const deviceToken = await ESPNotificationModule.getDeviceToken();
    return deviceToken;
  } catch (error) {
    console.error("Error fetching device token:", error);
    throw new Error(ERROR_MESSAGES.FETCH_TOKEN_FAILED);
  }
};

const validate = async (store: CDF) => {
  // Check module availability
  if (!isNotificationModuleAvailable()) {
    throw new Error(ERROR_MESSAGES.MODULE_NOT_AVAILABLE);
  }

  const user = store.userStore.user;
  if (!user) {
    throw new Error("User not available for creating platform endpoint");
  }

  // Fetch platform and device token
  const platform = await fetchPlatform();
  const deviceToken = await fetchDeviceToken();

  if (!platform || !deviceToken) {
    throw new Error("Platform or device token not available");
  }

  return {
    user,
    platform,
    deviceToken,
  };
};

/**
 * Creates a platform endpoint for notifications
 * @param platform - The notification platform name
 * @param deviceToken - The device token for the platform
 * @param store - The CDF store instance
 * @returns Promise<void>
 * @throws Error - When endpoint creation fails
 */
export const createPlatformEndpoint = async (store: CDF): Promise<void> => {
  try {
    const { user, platform, deviceToken } = await validate(store);

    const endpointConfig: PlatformEndpointConfig = {
      platform,
      deviceToken,
    };

    await user.createPlatformEndpoint(endpointConfig);
    // Subscribe to node updates
    user.subscribe(ESPRMEventType.nodeUpdates, (event: any) => {
      store.subscriptionStore.nodeUpdates.listen(event);
    });
  } catch (error) {
    console.error("Error creating platform endpoint:", error);
    throw new Error(ERROR_MESSAGES.CREATE_ENDPOINT_FAILED);
  }
};

/**
 * Deletes a platform endpoint for notifications and unsubscribes from node updates
 * @param store - The CDF store instance
 * @returns Promise<void>
 * @throws Error - When endpoint deletion fails
 */
export const deletePlatformEndpoint = async (store: CDF) => {
  try {
    const { user, deviceToken } = await validate(store);
    await user.deleteEndpoint(deviceToken, "");
    user.unsubscribe(
      ESPRMEventType.nodeUpdates,
      store.subscriptionStore.nodeUpdates.listen
    );
  } catch (error) {
    console.error("Error deleting platform endpoint:", error);
    throw new Error(ERROR_MESSAGES.DELETE_ENDPOINT_FAILED);
  }
};
