/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


// Third-party imports
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ESPCDF } from "@store";

// Local imports
import ESPNotificationModule from "@native-adaptors/interfaces/ESPNotificationInterface";

// Constants
const ERROR_MESSAGES = {
  MODULE_NOT_AVAILABLE: "ESPNotificationModule is not available",
  FETCH_PLATFORM_FAILED: "Failed to fetch notification platform",
  FETCH_TOKEN_FAILED: "Failed to get FCM token",
  CREATE_ENDPOINT_FAILED: "Failed to create platform endpoint",
  DELETE_ENDPOINT_FAILED: "Failed to delete platform endpoint",
} as const;

/** Last endpoint registration that succeeded on this device. */
const LAST_REGISTRATION_KEY = "notifications.lastRegisteredEndpoint";

/**
 * Re-register even when the token is unchanged once the last registration is
 * older than this, in case the backend or SNS dropped the endpoint meanwhile.
 */
const REGISTRATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface LastRegistration {
  /** CDF user id (or email when the id is unknown) the endpoint was registered for. */
  userId: string;
  platform: string;
  deviceToken: string;
  registeredAt: number;
}

const readLastRegistration = async (): Promise<LastRegistration | null> => {
  try {
    const raw = await AsyncStorage.getItem(LAST_REGISTRATION_KEY);
    return raw ? (JSON.parse(raw) as LastRegistration) : null;
  } catch {
    return null;
  }
};

const writeLastRegistration = async (entry: LastRegistration): Promise<void> => {
  try {
    await AsyncStorage.setItem(LAST_REGISTRATION_KEY, JSON.stringify(entry));
  } catch (error) {
    console.warn("Failed to store last notification registration:", error);
  }
};

const clearLastRegistration = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(LAST_REGISTRATION_KEY);
  } catch (error) {
    console.warn("Failed to clear last notification registration:", error);
  }
};

const isRegistrationCurrent = (
  last: LastRegistration | null,
  userId: string,
  platform: string,
  deviceToken: string,
): boolean =>
  !!last &&
  userId.length > 0 &&
  last.userId === userId &&
  last.platform === platform &&
  last.deviceToken === deviceToken &&
  Date.now() - last.registeredAt < REGISTRATION_MAX_AGE_MS;

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

const validate = async (store: ESPCDF) => {
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
 * Creates a platform endpoint for notifications.
 *
 * The backend creates the same SNS endpoint for the same token every time, so
 * the POST is skipped when this device already registered this platform and
 * token for this user recently. A changed FCM token, another account, a
 * logout (which clears the record) or `force` always registers again.
 * @param cdfStore - The CDF store instance
 * @param options - `force` registers even when the stored token matches
 * @returns Promise<void>
 * @throws Error - When endpoint creation fails
 */
export const registerForNotification = async (
  cdfStore: ESPCDF,
  options: { force?: boolean } = {},
): Promise<void> => {
  try {
    const { user, platform, deviceToken } = await validate(cdfStore);
    const userId = user.userInfo?.id?.trim() || user.userInfo?.email?.trim() || "";
    if (!options.force) {
      const last = await readLastRegistration();
      if (isRegistrationCurrent(last, userId, platform, deviceToken)) {
        return;
      }
    }
    await user.registerForNotification(platform, deviceToken);
    await writeLastRegistration({ userId, platform, deviceToken, registeredAt: Date.now() });
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
export const unregisterForNotification = async (cdfStore: ESPCDF) => {
  try {
    const { user, deviceToken } = await validate(cdfStore);

    await user?.unsubscribeFromNodeUpdates?.();
    await user?.unregisterForNotification(deviceToken);
    await clearLastRegistration();
  } catch (error) {
    console.error("Error deleting platform endpoint:", error);
    throw new Error(ERROR_MESSAGES.DELETE_ENDPOINT_FAILED);
  }
};
