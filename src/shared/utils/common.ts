/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import * as WebBrowser from "expo-web-browser";
import { POLLING, USER_PERMISSION } from "./constants";
import type { PollOptions, PollResult } from "@src/types/global";
import { ESPCDFUser, ESPCDFUserCustomDataRequest } from "@store";

/**
 * First value from Expo Router `useLocalSearchParams` when the value may be `string` or `string[]`.
 * Returns `undefined` for non-stringifiable values (e.g. mistaken object params) so UI never shows wrong values.
 * 
 * Expo is unreliable about the type of the params values at the runtime, so we need to coerce them to strings.
 */
export function firstRouteParam(
  value: string | string[] | undefined | unknown
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw === "string") {
    return raw;
  }
  if (typeof raw === "number" || typeof raw === "boolean") {
    return String(raw);
  }
  return undefined;
}

const ROUTE_PARAM_TRUE = new Set(["true", "1"]);
const ROUTE_PARAM_FALSE = new Set(["false", "0"]);

/**
 * Interprets a string route param as a boolean. `"true"` / `"1"` → `true`, `"false"` / `"0"` → `false`.
 * Any other value (including empty) falls back to `defaultValue` — use when the param is optional.
 */
export function parseRouteParamBoolean(
  value: string | undefined,
  defaultValue: boolean
): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  const v = value.trim().toLowerCase();
  if (ROUTE_PARAM_TRUE.has(v)) {
    return true;
  }
  if (ROUTE_PARAM_FALSE.has(v)) {
    return false;
  }
  return defaultValue;
}

/**
 * Handles open url logic for this module.
 */
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
 * JSON.stringify with recursively sorted object keys, so two deeply-equal
 * objects always serialize identically regardless of key insertion order.
 * Arrays keep their order. Useful for content-based change detection
 * (e.g. unsaved-changes snapshots).
 */
export const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify(
            (value as Record<string, unknown>)[key]
          )}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

/** One ring in a stacked node avatar row (device type + connectivity for imagery). */
export interface NodeDeviceImageEntry {
  key: string;
  type: string | undefined;
  connected: boolean;
}

/**
 * Generates a 4-character random ID
 * Uses uppercase letters and replaces numbers with 'X'
 * @returns 4-character identifier
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
  const period = hours >= 12 ? "PM" : "AM";
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
 * @returns {object} Object containing card dimensions and number of cards per row
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

/**
 * Retrieves scene card dimensions for downstream consumers.
 */
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


/**
 * Handles update last selected home logic for this module.
 */
export const updateLastSelectedHome = async (user: ESPCDFUser, lastSelectedHomeId: string) => {
  try {
    if (user) {
      const updatePayload: ESPCDFUserCustomDataRequest = {
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
      await user.setCustomData(updatePayload);
    }
  } catch (error) {
    console.error("Failed to update last selected home:", error);
  }
}

/**
 * Generates a 4-character random ID
 * Uses numbers and pads with '0' to make it 4 characters
 * @returns 4-character identifier [0000-9999]
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
 * @param pollFn - Async function that returns the result or null/undefined if not ready
 * @param options - Polling configuration options
 * @returns PollResult with success status and data
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
      console.info(
        `Polling for ${label} (attempt ${attempt}/${maxAttempts})...`
      );
    }

    try {
      const result = await pollFn();

      if (result !== null && result !== undefined) {
        if (enableLogging) {
          console.info(`${label} found on attempt ${attempt}`);
        }
        return {
          success: true,
          data: result,
          attempts: attempt,
        };
      }
    } catch (error) {
      if (enableLogging) {
        console.error(`${label} attempt ${attempt} failed:`, error);
      }
    }

    // Wait before next attempt (skip wait on last attempt)
    if (attempt < maxAttempts) {
      await delay(intervalMs);
    }
  }

  if (enableLogging) {
    console.error(`Could not get ${label} after ${maxAttempts} attempts`);
  }

  return {
    success: false,
    data: null,
    attempts: maxAttempts,
    error: `Failed to get ${label} after ${maxAttempts} attempts`,
  };
}

/**
 * Extracts a human-readable message from various error formats.
 * Handles Error instances, strings, and RainMaker-style API objects
 * (`description` / `errorCode`) without falling through to `[object Object]`.
 * @param error - Unknown error value (Error, string, or object)
 * @returns Extracted error message string
 */
export const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object") {
    const err = error as Record<string, unknown>;
    if (typeof err.message === "string" && err.message.trim()) {
      return err.message;
    }
    if (typeof err.description === "string" && err.description.trim()) {
      return err.description;
    }
    if (err.errorCode != null) {
      return String(err.errorCode);
    }
    if (err.code != null) {
      return String(err.code);
    }
    if (typeof err.toString === "function") {
      const asString = String(err.toString()).replace(/^Error:\s*/i, "");
      // Plain objects inherit Object#toString → "[object Object]"; skip that.
      if (asString && asString !== "[object Object]") {
        return asString;
      }
    }
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};

/**
 * Promise-based delay utility
 */
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Formats a config key for display (e.g., baseUrl -> Base URL)
 * @param key - The config key to format
 * @returns Formatted label string
 */
export const formatConfigKey = (key: string): string => {
  const label = key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
  return label
    .replace(/\bApi\b/gi, "API")
    .replace(/\bIot\b/gi, "IoT")
    .replace(/\bUrl\b/gi, "URL")
    .replace(/\bId\b/gi, "ID");
};

/**
 * Converts a Uint8Array to a Base64 encoded string.
 * @param uint8Array - The Uint8Array to convert.
 * @returns The Base64 encoded string.
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
 * @param base64 - The Base64 encoded string to convert.
 * @returns The resulting Uint8Array.
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