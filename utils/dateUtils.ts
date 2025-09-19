/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Date utility functions for sharing request expiration
 */

/**
 * Calculates remaining days until a sharing request expires (7 days from creation)
 * @param timestamp - Unix timestamp in seconds (from API)
 * @returns Number of days remaining (0-7), or -1 if expired
 */
export const getRemainingDays = (timestamp: number): number => {
  // Convert timestamp from seconds to milliseconds
  const requestDate = new Date(timestamp * 1000);
  const currentDate = new Date();

  // Reset time to start of day for accurate day calculation
  const requestDateStart = new Date(
    requestDate.getFullYear(),
    requestDate.getMonth(),
    requestDate.getDate()
  );
  const currentDateStart = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate()
  );

  // Calculate difference in days
  const diffInMs = currentDateStart.getTime() - requestDateStart.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  // Calculate remaining days (7 days total expiration period)
  const remainingDays = 7 - diffInDays;

  return remainingDays;
};

/**
 * Checks if a sharing request has expired
 * @param timestamp - Unix timestamp in seconds (from API)
 * @returns true if expired, false if still valid
 */
export const isRequestExpired = (timestamp: number): boolean => {
  return getRemainingDays(timestamp) < 0;
};

/**
 * Formats expiration message for display
 * @param timestamp - Unix timestamp in seconds (from API)
 * @param t - Translation function (optional, for localization)
 * @returns Formatted string like "Expires in 3 days" or "Expires today", or null if expired/invalid
 */
export const formatExpirationMessage = (
  timestamp: number,
  t?: (key: string, options?: any) => string
): string | null => {
  const remainingDays = getRemainingDays(timestamp);

  // If remainingDays < 0 or > 7, don't show any message
  if (remainingDays < 0 || remainingDays > 7) {
    return null;
  } else if (remainingDays === 0) {
    return t ? t("group.settings.expiresToday") : "Expires today";
  } else if (remainingDays === 1) {
    return t
      ? t("group.settings.expiresIn") + " " + t("group.settings.expiresInDay")
      : "Expires in 1 day";
  } else {
    return t
      ? t("group.settings.expiresIn") +
          " " +
          t("group.settings.expiresInDays", { count: remainingDays })
      : `Expires in ${remainingDays} days`;
  }
};

/**
 * Sorts sharing requests by remaining days (most urgent first)
 * @param requests - Array of sharing requests with timestamp property
 * @returns Sorted array with requests expiring soonest first
 */
export const sortByExpirationDate = <T extends { timestamp?: number }>(
  requests: T[]
): T[] => {
  return [...requests].sort((a, b) => {
    // Handle cases where timestamp might be undefined
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    const remainingDaysA = getRemainingDays(a.timestamp);
    const remainingDaysB = getRemainingDays(b.timestamp);
    return remainingDaysA - remainingDaysB;
  });
};

/**
 * Filters out expired requests
 * @param requests - Array of sharing requests with timestamp property
 * @returns Array with only non-expired requests
 */
export const filterExpiredRequests = <T extends { timestamp?: number }>(
  requests: T[]
): T[] => {
  return requests.filter(
    (request) => request.timestamp && !isRequestExpired(request.timestamp)
  );
};
