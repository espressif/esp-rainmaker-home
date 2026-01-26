/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AggregationIntervalType } from "@/types/global";
import { MS } from "./timeSeriesHelper";

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum interval constants for date range selection
 * 
 * WHY: Defines the maximum allowed time ranges for different aggregation intervals.
 * These limits are enforced by the API and prevent requests that would be too large
 * or unsupported. Used throughout date range validation and selection to ensure users
 * cannot select ranges that exceed API capabilities.
 * 
 * These constants are aligned with the limits defined in timeSeriesHelper.ts to maintain
 * consistency across the codebase. They are used by:
 * - Date range picker validation (preventing invalid selections)
 * - getMaxInterval() function (returning appropriate limits)
 * - determineRangeDurationAggregationInterval() function (selecting appropriate intervals)
 * 
 * IMPORTANT: These limits must match the API's actual capabilities. Changing these
 * values without API support will cause request failures.
 */
export const DATE_RANGE_CONSTANTS = {
  /** Raw data max interval (31 days) - stricter limit for unaggregated data */
  RAW_DATA_MAX_INTERVAL: 31 * MS.DAY,
  /** Day interval max (31 days) - maximum range for day-level aggregation */
  DAY_INTERVAL_MAX: 31 * MS.DAY,
  /** Month interval max (350 days) - maximum range for month-level aggregation */
  MONTH_INTERVAL_MAX: 350 * MS.DAY,
  /** Year interval max (5 years) - maximum range for year-level aggregation */
  YEAR_INTERVAL_MAX: 5 * 365 * MS.DAY,
} as const;

// ============================================================================
// Date Alignment Functions
// ============================================================================

/**
 * Aligns a timestamp to the start of the day (00:00:00.000)
 * 
 * WHY: Date range selections need to be aligned to consistent boundaries for proper
 * data retrieval and display. When users select a date range, the start time should
 * begin at midnight (00:00:00.000) to ensure complete day coverage. This function:
 * - Normalizes timestamps to day boundaries for consistent API requests
 * - Ensures date pickers align selections to day starts
 * - Works with date range navigation to maintain proper boundaries
 * 
 * Used by:
 * - Date range picker components (aligning selected start dates)
 * - Date range validation (ensuring ranges start at day boundaries)
 * - Custom date range calculations (when building API requests)
 * 
 * Note: This function uses local timezone, which is appropriate for date pickers
 * that display dates in the user's local timezone.
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Aligned timestamp at day start (00:00:00.000) in local timezone
 *
 * @example
 * const timestamp = new Date('2025-01-15 14:30:00').getTime();
 * const aligned = alignToDayStart(timestamp);
 * // Returns timestamp for '2025-01-15 00:00:00.000'
 */
export const alignToDayStart = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/**
 * Aligns a timestamp to the start of the month (1st day, 00:00:00.000)
 * 
 * WHY: Month-level aggregations require alignment to month boundaries for accurate
 * data grouping. When users select date ranges that span months, or when the system
 * automatically determines month-level aggregation intervals, timestamps need to be
 * aligned to the first day of the month. This ensures:
 * - Consistent month boundaries for aggregation calculations
 * - Proper month-level date range selections
 * - Accurate month-based navigation (e.g., "Previous Month", "Next Month")
 * 
 * Used by:
 * - Month-level aggregation interval calculations
 * - Date range pickers with month selection mode
 * - Custom date range validation for month intervals
 * 
 * Note: Handles variable month lengths correctly (28-31 days) by using setDate(1).
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Aligned timestamp at month start (1st day, 00:00:00.000) in local timezone
 *
 * @example
 * const timestamp = new Date('2025-01-15 14:30:00').getTime();
 * const aligned = alignToMonthStart(timestamp);
 * // Returns timestamp for '2025-01-01 00:00:00.000'
 */
export const alignToMonthStart = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/**
 * Aligns a timestamp to the start of the year (Jan 1st, 00:00:00.000)
 * 
 * WHY: Year-level aggregations and date range selections need alignment to calendar
 * year boundaries. This function ensures timestamps are normalized to January 1st
 * at midnight, which is essential for:
 * - Year-level aggregation calculations (e.g., "2024" should start at Jan 1, 2024)
 * - Year-based date range selections in date pickers
 * - Consistent year navigation (e.g., "Previous Year", "Next Year")
 * - Proper handling of the 1Y period which uses calendar year boundaries
 * 
 * Used by:
 * - Year-level aggregation interval calculations
 * - Date range pickers with year selection mode
 * - Custom date range validation for year intervals
 * - Time series period calculations (1Y period uses calendar years)
 * 
 * Note: This aligns to calendar year boundaries (Jan 1 - Dec 31), not 365-day periods.
 * This matches user expectations for "year" selections in date pickers.
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Aligned timestamp at year start (Jan 1st, 00:00:00.000) in local timezone
 *
 * @example
 * const timestamp = new Date('2025-06-15 14:30:00').getTime();
 * const aligned = alignToYearStart(timestamp);
 * // Returns timestamp for '2025-01-01 00:00:00.000'
 */
export const alignToYearStart = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setMonth(0, 1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

// ============================================================================
// Date End Functions
// ============================================================================

/**
 * Gets the end of day timestamp (23:59:59.999)
 * 
 * WHY: Date range selections need to include the complete day, which means the end
 * time should be at 23:59:59.999 (the last millisecond of the day). This ensures:
 * - Complete day coverage in API requests (all data from the selected day)
 * - Proper date range validation (end time includes the full selected day)
 * - Consistent date range calculations (start at 00:00:00, end at 23:59:59.999)
 * 
 * Used by:
 * - Date range picker components (calculating end times for selected dates)
 * - Date range validation (ensuring ranges end at day boundaries)
 * - Custom date range calculations (building complete day ranges)
 * 
 * Note: Uses 23:59:59.999 (not 24:00:00) to represent the last moment of the day.
 * This is the standard way to represent end-of-day in timestamp systems.
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns End of day timestamp (23:59:59.999) in local timezone
 *
 * @example
 * const timestamp = new Date('2025-01-15 14:30:00').getTime();
 * const endOfDay = getEndOfDay(timestamp);
 * // Returns timestamp for '2025-01-15 23:59:59.999'
 */
export const getEndOfDay = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
};

/**
 * Gets the end of month timestamp (last day, 23:59:59.999)
 * 
 * WHY: Month-level date ranges need to include the complete month, which means
 * ending at the last day of the month at 23:59:59.999. This function handles
 * variable month lengths correctly (28-31 days) by using the JavaScript Date
 * trick of setting the date to 0 of the next month, which gives the last day
 * of the current month. This ensures:
 * - Complete month coverage in API requests (all data from the selected month)
 * - Proper handling of variable month lengths (Feb has 28/29 days, others have 30/31)
 * - Consistent month boundary calculations for aggregation intervals
 * 
 * Used by:
 * - Month-level date range selections
 * - Month aggregation interval calculations
 * - Date range validation for month intervals
 * - Custom date range calculations with month boundaries
 * 
 * Note: The setDate(0) trick is a standard JavaScript pattern to get the last
 * day of a month. It works by going to day 0 of the next month, which is the
 * last day of the current month.
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns End of month timestamp (last day, 23:59:59.999) in local timezone
 *
 * @example
 * const timestamp = new Date('2025-01-15 14:30:00').getTime();
 * const endOfMonth = getEndOfMonth(timestamp);
 * // Returns timestamp for '2025-01-31 23:59:59.999'
 */
export const getEndOfMonth = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setMonth(date.getMonth() + 1);
  date.setDate(0); // Last day of current month
  date.setHours(23, 59, 59, 999);
  return date.getTime();
};

/**
 * Gets the end of year timestamp (Dec 31st, 23:59:59.999)
 * 
 * WHY: Year-level date ranges need to include the complete calendar year, ending
 * at December 31st at 23:59:59.999. This ensures:
 * - Complete year coverage in API requests (all data from the selected year)
 * - Proper calendar year boundary calculations (Jan 1 - Dec 31)
 * - Consistent year-level aggregation intervals
 * - Accurate year-based date range selections
 * 
 * Used by:
 * - Year-level date range selections
 * - Year aggregation interval calculations
 * - Date range validation for year intervals
 * - Custom date range calculations with year boundaries
 * - Time series period calculations (1Y period uses calendar years)
 * 
 * Note: This aligns to calendar year boundaries (Dec 31), not 365-day periods.
 * This matches user expectations for "year" selections in date pickers and aligns
 * with the 1Y period's use of calendar year boundaries.
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns End of year timestamp (Dec 31st, 23:59:59.999) in local timezone
 *
 * @example
 * const timestamp = new Date('2025-06-15 14:30:00').getTime();
 * const endOfYear = getEndOfYear(timestamp);
 * // Returns timestamp for '2025-12-31 23:59:59.999'
 */
export const getEndOfYear = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setMonth(11, 31);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
};

// ============================================================================
// Aggregation Interval Functions
// ============================================================================

/**
 * Determines the appropriate aggregation interval based on range duration
 * 
 * WHY: When users select custom date ranges, the system needs to automatically
 * determine the best aggregation interval for efficient data retrieval. Different
 * range durations require different intervals:
 * - Short ranges (1-31 days): Use "day" interval for hourly or daily aggregation
 * - Medium ranges (31-350 days): Use "month" interval for monthly aggregation
 * - Long ranges (350+ days): Use "year" interval for yearly aggregation
 * - Raw data: Always use "day" interval (has strict 31-day limit)
 * 
 * This function ensures:
 * - Optimal API request efficiency (using appropriate aggregation granularity)
 * - Proper data grouping for chart display
 * - Automatic interval selection without user intervention
 * - Compliance with API limits (raw data has special 31-day limit)
 * 
 * Used by:
 * - Date range picker components (auto-selecting interval when range is selected)
 * - Custom date range validation (determining valid intervals)
 * - Chart data request building (selecting appropriate aggregation interval)
 * 
 * Note: This function is similar to determineIntervalFromDuration() in timeSeriesHelper.ts
 * but is specifically designed for date range helper operations. Both functions should
 * maintain consistent logic.
 *
 * Rules:
 * - raw aggregation: always returns "day" (with 31 day limit)
 * - 1-31 days: returns "day"
 * - 31-350 days: returns "month"
 * - 350 days to 5 years: returns "year"
 *
 * @param rangeDuration - Duration of the range in milliseconds
 * @param aggregation - Aggregation method ("raw" has special handling, others use duration-based logic)
 * @returns Suggested aggregation interval type ("day", "month", or "year")
 *
 * @example
 * const duration = 7 * MS.DAY; // 7 days
 * const interval = determineRangeDurationAggregationInterval(rangeDuration, aggregation);
 * // Returns "day"
 */
export const determineRangeDurationAggregationInterval = (
  rangeDuration: number,
  aggregation?: string
): AggregationIntervalType => {
  // For raw aggregation, always use day interval (31 days max)
  if (aggregation === "raw") {
    return "day";
  }

  // Determine interval based on range duration
  if (rangeDuration <= DATE_RANGE_CONSTANTS.DAY_INTERVAL_MAX) {
    return "day";
  } else if (rangeDuration <= DATE_RANGE_CONSTANTS.MONTH_INTERVAL_MAX) {
    return "month";
  } else {
    return "year";
  }
};

/**
 * Gets the maximum allowed interval for a given aggregation interval type
 * 
 * WHY: Date range validation needs to check if a selected range exceeds the API's
 * maximum limits. This function returns the appropriate maximum duration based on
 * the aggregation interval and method. This is essential for:
 * - Date range picker validation (preventing users from selecting invalid ranges)
 * - Error messages (showing users what the maximum allowed range is)
 * - Automatic range adjustment (clamping selections to valid ranges)
 * - API request validation (ensuring requests don't exceed limits before sending)
 * 
 * Special handling:
 * - Raw aggregation: Always has a strict 31-day limit (regardless of interval)
 * - Other aggregations: Limits vary by interval type (day: 31 days, month: 350 days, year: 5 years)
 * 
 * Used by:
 * - Date range picker components (validating selected ranges)
 * - Date range validation functions (checking if ranges are within limits)
 * - Error message generation (showing maximum allowed ranges)
 * - Custom date range calculations (ensuring ranges don't exceed limits)
 * 
 * Note: These limits must match the API's actual capabilities. The constants are
 * defined in DATE_RANGE_CONSTANTS and should be kept in sync with API documentation.
 *
 * @param aggregationInterval - The aggregation interval type ("day", "month", or "year")
 * @param aggregation - Aggregation method ("raw" has special 31 day limit, others use interval-based limits)
 * @returns Maximum interval in milliseconds for the given interval type and aggregation method
 *
 * @example
 * const maxInterval = getMaxInterval("month", "avg");
 * // Returns MONTH_INTERVAL_MAX (350 days)
 * 
 * const rawMaxInterval = getMaxInterval("day", "raw");
 * // Returns RAW_DATA_MAX_INTERVAL (31 days) - raw always has 31 day limit
 */
export const getMaxInterval = (
  aggregationInterval: AggregationIntervalType,
  aggregation?: string
): number => {
  // Raw aggregation always has 31 day limit
  if (aggregation === "raw") {
    return DATE_RANGE_CONSTANTS.RAW_DATA_MAX_INTERVAL;
  }

  // For other aggregations, allow longer ranges based on interval
  switch (aggregationInterval) {
    case "day":
      return DATE_RANGE_CONSTANTS.DAY_INTERVAL_MAX;
    case "month":
      return DATE_RANGE_CONSTANTS.MONTH_INTERVAL_MAX;
    case "year":
      return DATE_RANGE_CONSTANTS.YEAR_INTERVAL_MAX;
    default:
      return DATE_RANGE_CONSTANTS.DAY_INTERVAL_MAX;
  }
};

// ============================================================================
// Date Formatting Functions
// ============================================================================

/**
 * Formats a date range for display in the UI
 * 
 * WHY: Date ranges selected by users need to be displayed in a readable format
 * throughout the UI. This function converts date strings (YYYY-MM-DD format from
 * date pickers) into a user-friendly "Start Date - End Date" format. This ensures:
 * - Consistent date formatting across all UI components
 * - Readable date range display (e.g., "Jan 15, 2025 - Jan 20, 2025")
 * - Proper handling of missing dates (returns null if either date is missing)
 * 
 * Used by:
 * - Date range picker components (displaying selected ranges)
 * - Chart headers (showing the selected date range)
 * - Date range validation messages (showing formatted ranges in errors)
 * - Custom date range selection UI (displaying current selection)
 * 
 * Note: This function uses "en-US" locale for consistent formatting. For
 * internationalization, consider passing locale as a parameter or using
 * a localization library.
 *
 * @param startDate - Start date string in YYYY-MM-DD format (from date picker)
 * @param endDate - End date string in YYYY-MM-DD format (from date picker)
 * @returns Formatted date range string in "Start Date - End Date" format, or null if dates are missing
 *
 * @example
 * const formatted = formatDateRangeDisplay("2025-01-15", "2025-01-20");
 * // Returns "Jan 15, 2025 - Jan 20, 2025"
 */
export const formatDateRangeDisplay = (
  startDate: string | null,
  endDate: string | null
): string | null => {
  if (!startDate || !endDate) {
    return null;
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  const startStr = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const endStr = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `${startStr} - ${endStr}`;
};

/**
 * Converts a timestamp to YYYY-MM-DD format string (local timezone)
 * 
 * WHY: Date pickers and date input fields typically work with date strings in
 * YYYY-MM-DD format (ISO 8601 date format). This function converts timestamps
 * (used internally for calculations) to date strings (used by UI components).
 * This is essential for:
 * - Populating date picker values (date pickers expect YYYY-MM-DD strings)
 * - Converting calculated timestamps to date input format
 * - Formatting dates for API requests that expect date strings
 * - Displaying dates in date input fields
 * 
 * Used by:
 * - Date range picker components (converting timestamps to date picker values)
 * - Date input fields (formatting timestamps for input display)
 * - Date range calculations (converting calculated timestamps to date strings)
 * - Custom date range selection UI (formatting dates for display)
 * 
 * Note: Uses "en-CA" locale which produces YYYY-MM-DD format. This is the
 * standard ISO 8601 date format used by HTML date inputs and most date pickers.
 * The function uses local timezone, which is appropriate for date pickers that
 * display dates in the user's local timezone.
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Date string in YYYY-MM-DD format (ISO 8601) in local timezone
 *
 * @example
 * const dateStr = timestampToDateString(Date.now());
 * // Returns "2025-01-15" (in local timezone)
 */
export const timestampToDateString = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString("en-CA");
};

/**
 * Converts a date string to timestamp
 * 
 * WHY: Date pickers and date input fields return date strings in YYYY-MM-DD format,
 * but internal calculations and API requests need timestamps (milliseconds since epoch).
 * This function converts date strings (from UI components) to timestamps (for calculations).
 * This is essential for:
 * - Converting date picker selections to timestamps for calculations
 * - Building API requests that require timestamps
 * - Date range calculations (working with timestamps internally)
 * - Time series data requests (API expects timestamps, not date strings)
 * 
 * Used by:
 * - Date range picker components (converting selected dates to timestamps)
 * - Date input handlers (converting user input to timestamps)
 * - Date range validation (converting date strings to timestamps for comparison)
 * - Custom date range selection UI (converting selections to timestamps)
 * 
 * Note: The date string is parsed in local timezone, and the resulting timestamp
 * represents midnight (00:00:00) of that date in the local timezone. This is the
 * standard behavior for date-only strings (without time components).
 *
 * @param dateString - Date string in YYYY-MM-DD format (ISO 8601) from date picker or input field
 * @returns Unix timestamp in milliseconds representing midnight (00:00:00) of the date in local timezone
 *
 * @example
 * const timestamp = dateStringToTimestamp("2025-01-15");
 * // Returns timestamp for Jan 15, 2025 00:00:00 in local timezone
 */
export const dateStringToTimestamp = (dateString: string): number => {
  return new Date(dateString).getTime();
};
