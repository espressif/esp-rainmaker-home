/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import * as WebBrowser from "expo-web-browser";

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
