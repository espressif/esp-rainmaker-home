/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import * as WebBrowser from "expo-web-browser";
import { CDF } from "@espressif/rainmaker-base-cdf";
import { POLLING, SUCESS, USER_PERMISSION } from "./constants";
import { UserCustomDataRequest } from "@espressif/rainmaker-base-sdk";
import { PollOptions, PollResult } from "@/types/global";

export const openUrl = (url: string) => {
    WebBrowser.openBrowserAsync(url);
};
/**
 * Creates a deep clone of an object or array
 * @param obj The object to clone
 * @returns A deep clone of the object
 */
export const deepClone = <T>(obj: T): T => {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => deepClone(item)) as unknown as T;
    }

    const clonedObj = {} as T;
    Object.entries(obj).forEach(([key, value]) => {
        (clonedObj as any)[key] = deepClone(value);
    });

    return clonedObj;
};

/**
 * Generates a 4-character random ID
 * Uses uppercase letters and replaces numbers with 'X'
 * @returns {string} 4-character identifier
 */
export const generateRandomId = () => {
    const randomStr = Math.random().toString(36).substring(2, 15);
    return randomStr.toUpperCase().replace(/[0-9]/g, "X").substring(0, 4);
}

/**
 * Formats minutes since midnight to 12-hour time format
 * @param minutes - Minutes since midnight (e.g., 1024 for 17:04)
 * @returns Formatted time string (e.g., "5:04 pm")
 */
export const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const period = hours >= 12 ? "pm" : "am";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${mins.toString().padStart(2, "0")} ${period}`;
};

/**
 * Formats relative seconds into hours and minutes
 * @param seconds - Number of seconds from now
 * @returns Formatted time string (e.g., "in 2h 30m")
 */
export const formatRelativeTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `in ${hours}h ${minutes}m`;
};

/**
 * Gets formatted time text from a schedule trigger
 * @param trigger - Schedule trigger object
 * @returns Formatted time string based on trigger type
 */
export const getScheduleTimeText = (trigger: any): string => {
    if (trigger.rsec !== undefined) {
        return formatRelativeTime(trigger.rsec);
    }

    if (trigger.m !== undefined) {
        return formatTime(trigger.m);
    }

    return "";
};


/**
 * Calculates the dimensions of scene cards based on screen width and number of cards per row
 * @param SIDE_PADDING - Padding on each side of the screen
 * @param CARD_MARGIN_RIGHT - Margin between cards
 * @param MIN_CARD_WIDTH - Minimum width of a card
 * @param NUM_CARDS_3 - Number of cards per row when 3 cards fit
 * @param NUM_CARDS_2 - Number of cards per row when 2 cards fit
 * @param screenWidth - Width of the screen
 * @returns {Object} Object containing card dimensions and number of cards per row
 */
/**
 * Helper functions for time picker
 */

/**
 * Get platform specific scroll parameters for time picker
 */
export const getTimePickerScrollParams = (Platform: any) => ({
  scrollEventThrottle: Platform.OS === "android" ? 32 : 16,
  decelerationRate: 0.92,
});

/**
 * Calculate the selected index from scroll position
 * @param y Scroll position Y
 * @param itemHeight Height of each item
 * @returns Selected index
 */
export const calculateSelectedIndex = (y: number, itemHeight: number): number => {
  return Math.floor((y + itemHeight / 2) / itemHeight);
};

/**
 * Generate array of numbers in range
 * @param start Start number
 * @param end End number
 * @returns Array of numbers
 */
export const generateNumberArray = (start: number, end: number): number[] => {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
};

/**
 * Formats time to 12-hour format with AM/PM
 * @param date Date object to format
 * @returns Formatted time string
 */
export const formatTimeToAMPM = (date: Date): string => {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

/**
 * Converts hours and period to 24-hour format
 * @param hours Hours in 12-hour format (1-12)
 * @param period AM or PM
 * @returns Hours in 24-hour format (0-23)
 */
export const convertTo24Hour = (hours: number, period: "AM" | "PM"): number => {
  if (period === "PM" && hours !== 12) {
    return hours + 12;
  }
  if (period === "AM" && hours === 12) {
    return 0;
  }
  return hours;
};

/**
 * Converts minutes since midnight to Date object
 * @param minutes Minutes since midnight
 * @returns Date object set to the specified time
 */
export const minutesToDate = (minutes: number): Date => {
  const date = new Date();
  date.setHours(Math.floor(minutes / 60));
  date.setMinutes(minutes % 60);
  return date;
};

/**
 * Converts Date object to minutes since midnight
 * @param date Date object
 * @returns Minutes since midnight
 */
export const dateToMinutes = (date: Date): number => {
  return date.getHours() * 60 + date.getMinutes();
};

export const getSceneCardDimensions = ({
    SIDE_PADDING,
    CARD_MARGIN_RIGHT,
    MIN_CARD_WIDTH,
    NUM_CARDS_3,
    NUM_CARDS_2,
    screenWidth,
}: {
    SIDE_PADDING: number;
    CARD_MARGIN_RIGHT: number;
    MIN_CARD_WIDTH: number;
    NUM_CARDS_3: number;
    NUM_CARDS_2: number;
    screenWidth: number;
}) => {
    // Try to fit 3 cards
    const totalHorizontalPadding = SIDE_PADDING * 2;
    const totalMarginFor3 = CARD_MARGIN_RIGHT * (NUM_CARDS_3 - 1);
    const availableWidth3 =
        screenWidth - totalHorizontalPadding - totalMarginFor3;
    const cardWidth3 = Math.floor(availableWidth3 / NUM_CARDS_3);

    if (cardWidth3 >= MIN_CARD_WIDTH) {
        return {
            width: cardWidth3,
            height: cardWidth3, // keep square, or adjust as needed
            cardsPerRow: 3,
        };
    } else {
        // Fallback to 2 cards per row
        const totalMarginFor2 = CARD_MARGIN_RIGHT * (NUM_CARDS_2 - 1);
        const availableWidth2 =
            screenWidth - totalHorizontalPadding - totalMarginFor2;
        const cardWidth2 = Math.floor(availableWidth2 / NUM_CARDS_2);
        return {
            width: cardWidth2,
            height: cardWidth2, // keep square, or adjust as needed
            cardsPerRow: 2,
        };
    }
};


export const updateLastSelectedHome = async (userStore: CDF["userStore"], lastSelectedHomeId: string) => {
  try {
    if (userStore.user && userStore.userInfo) {
      const updatePayload: UserCustomDataRequest = {
        lastSelectedHomeId: {
          value: lastSelectedHomeId,
          perms: [
            {
              read: [USER_PERMISSION],
            },
            {
              write: [USER_PERMISSION],
            },
          ],
        },
      }
      const response = await userStore.user.setCustomData(updatePayload);
      if (response.status === SUCESS) {
      // on successful setCustomData call, 
      // update the custom data in the userInfo store to reflect the changes
      userStore.userInfo.customData = {
        // Ensure not get an error if userStore.userInfo.customData is undefined
          ...(userStore.userInfo.customData ?? {}),
          ...updatePayload,
        }
      }
    }
  } catch (error) {
    console.error("Failed to update last selected home:", error);
  }
}

/**
 * Generates a 4-character random ID
 * Uses numbers and pads with '0' to make it 4 characters
 * @returns {string} 4-character identifier [0000-9999]
 */
export const getRandom4DigitString = () => {
  return Math.floor(Math.random() * 10000)
  .toString()
  .padStart(4, "0");
};


export const DEFAULT_POLLING_OPTIONS: Required<Omit<PollOptions, "label">> & {
  label: string;
} = {
  maxAttempts: POLLING.MAX_ATTEMPTS,
  intervalMs: POLLING.INTERVAL_MS,
  label: POLLING.DEFAULT_LABEL,
  enableLogging: POLLING.ENABLE_LOGGING,
};

/**
 * Generic polling function that retries an async operation until success or max attempts.
 *
 * @param pollFn - Async function that returns the result or null/undefined if not ready
 * @param options - Polling configuration options
 * @returns PollResult with success status and data
 *
 * @example
 * ```typescript
 * const result = await pollUntilReady(
 *   async () => {
 *     await syncData();
 *     const item = getItem(id);
 *     return item?.config ? item.config : null;
 *   },
 *   { maxAttempts: 5, intervalMs: 2000, label: "node config" }
 * );
 *
 * if (result.success) {
 *   console.log("Got data:", result.data);
 * }
 * ```
 */
export async function pollUntilReady<T>(
  pollFn: () => Promise<T | null | undefined>,
  options: PollOptions = {}
): Promise<PollResult<T>> {
  const config = { ...DEFAULT_POLLING_OPTIONS, ...options };
  const { maxAttempts, intervalMs, label, enableLogging } = config;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (enableLogging) {
      console.log(
        `Polling for ${label} (attempt ${attempt}/${maxAttempts})...`
      );
    }

    try {
      const result = await pollFn();

      if (result !== null && result !== undefined) {
        if (enableLogging) {
          console.log(`${label} found on attempt ${attempt}`);
        }
        return {
          success: true,
          data: result,
          attempts: attempt,
        };
      }
    } catch (error) {
      if (enableLogging) {
        console.warn(`${label} attempt ${attempt} failed:`, error);
      }
    }

    // Wait before next attempt (skip wait on last attempt)
    if (attempt < maxAttempts) {
      await delay(intervalMs);
    }
  }

  if (enableLogging) {
    console.warn(`Could not get ${label} after ${maxAttempts} attempts`);
  }

  return {
    success: false,
    data: null,
    attempts: maxAttempts,
    error: `Failed to get ${label} after ${maxAttempts} attempts`,
  };
}

/**
 * Promise-based delay utility
 */
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Converts a Uint8Array to a Base64 encoded string.
 *
 * @param {Uint8Array} uint8Array - The Uint8Array to convert.
 * @returns {string} The Base64 encoded string.
 */
export const uint8ArrayToBase64 = (uint8Array: Uint8Array): string => {
  let binaryString = "";
  for (let i = 0; i < uint8Array.length; i++) {
    binaryString += String.fromCharCode(uint8Array[i]);
  }

  return btoa(binaryString);
};

/**
 * Converts a Base64 encoded string to a Uint8Array.
 *
 * @param {string} base64 - The Base64 encoded string to convert.
 * @returns {Uint8Array} The resulting Uint8Array.
 */
export const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = atob(base64);

  const len = binaryString.length;
  const bytes = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes;
};