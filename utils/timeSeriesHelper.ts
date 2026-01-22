/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ESPTSDataRequest,
  ESPSimpleTSDataRequest,
  ESPAggregationInterval,
  ESPAggregationMethod,
} from "@espressif/rainmaker-base-sdk";
import type {
  ChartDataPoint,
  TimeSeriesPeriod,
  AggregationMethod,
  TimeSeriesRequestParams,
  AggregationIntervalType,
  DateRange,
} from "@/types/global";
import {
  ESPRM_TEMPERATURE_PARAM_TYPE,
  TIME_SERIES_LABELS,
  TIME_SERIES_PERIOD_1H,
  TIME_SERIES_PERIOD_1D,
  TIME_SERIES_PERIOD_7D,
  TIME_SERIES_PERIOD_4W,
  TIME_SERIES_PERIOD_1Y,
  DATA_TYPE_FLOAT,
  DATA_TYPE_INT,
  DATA_TYPE_BOOL,
  DATA_TYPE_STRING,
} from "./constants";
import { TimeSeriesValidationError } from "@/types/global";

// ============================================================================
// Time Constants
// ============================================================================

/**
 * Time constants in milliseconds
 * 
 * Provides standardized time unit conversions used throughout the time series helper.
 * This ensures consistent time calculations across all functions and prevents magic numbers.
 * Used for calculating durations, intervals, and time ranges for chart data requests.
 */
export const MS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  YEAR_APPROX: 365 * 24 * 60 * 60 * 1000,
} as const;

// ============================================================================
// Alignment Helpers (Consolidated)
// ============================================================================

/**
 * Boundary unit types for alignment
 * 
 * Defines the types of time boundaries that timestamps can be aligned to.
 * Used by alignToBoundary() to normalize timestamps for consistent time range calculations.
 */
type BoundaryUnit = "hour" | "day" | "month" | "week" | "end-of-day" | "end-of-month";

/**
 * Aligns a timestamp to a specific boundary
 * Consolidates all alignment operations into a single function
 * 
 * Time series data needs to be aligned to consistent boundaries (start of hour, day, week, month)
 * for proper aggregation and chart display. This function ensures all timestamps are normalized
 * to these boundaries, which is critical for:
 * - Consistent data bucketing in aggregations
 * - Proper chart axis labeling
 * - Accurate time range calculations
 * - Handling DST (Daylight Saving Time) transitions correctly
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @param unit - The boundary unit to align to ("hour", "day", "week", "month", "end-of-day", "end-of-month")
 * @param weekStart - Week start day (0 = Sunday, 1 = Monday, etc.) - only for "week" alignment
 * @returns Timestamp aligned to the specified boundary in milliseconds
 */
const alignToBoundary = (timestamp: number, unit: BoundaryUnit, weekStart: number = 1): number => {
  const date = new Date(timestamp);
  
  switch (unit) {
    case "hour":
      date.setMinutes(0, 0, 0);
      return date.getTime();
    case "day":
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    case "week": {
      const day = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const diff = (day < weekStart ? 7 : 0) + day - weekStart;
      date.setDate(date.getDate() - diff);
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    }
    case "month":
      date.setDate(1);
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    case "end-of-day":
      date.setHours(23, 59, 59, 999);
      return date.getTime();
    case "end-of-month": {
      date.setMonth(date.getMonth() + 1);
      date.setDate(0); // Last day of current month
      date.setHours(23, 59, 59, 999);
      return date.getTime();
    }
    default:
      return timestamp;
  }
};

// ============================================================================
// Period Configuration (Consolidated)
// ============================================================================

/**
 * Step unit type for timestamp generation
 * 
 * Defines the units used for generating timestamp sequences during interpolation.
 * Some periods use fixed millisecond steps (minute, hour, day), while others need
 * calendar-aware steps (month) to handle variable month lengths correctly.
 */
type StepUnit = "minute" | "hour" | "day" | "month";

/**
 * Period configuration interface
 * Consolidates all period-specific settings in one place
 * 
 * Each time period (1H, 1D, 7D, 4W, 1Y) has specific configuration needs:
 * - Aggregation interval (how data is grouped)
 * - Number of intervals (how many data points)
 * - Step size (for generating expected timestamps)
 * - Label intervals (for chart label limiting)
 * - Duration and offset multipliers (for navigation)
 * - Special rules (for complex periods like 1Y with calendar year boundaries)
 * 
 * This interface ensures all period-specific logic is centralized and maintainable.
 */
interface PeriodConfig {
  /** Aggregation interval for this period */
  aggregationInterval: ESPAggregationInterval;
  /** Number of intervals for this period */
  numIntervals: number;
  /** Step size in milliseconds (or use stepUnit for month) */
  stepMs: number;
  /** Step unit (for month-based steps) */
  stepUnit?: StepUnit;
  /** Label interval in hours (for chart label limiting) */
  labelIntervalHours: number;
  /** Duration in milliseconds for this period */
  durationMs: number;
  /** Offset multiplier for calculating base end time */
  offsetMultiplier: number;
  /** Special rules for this period */
  specialRules?: {
    /** Max duration cap (e.g., 360 days for 1Y) */
    maxDurationMs?: number;
    /** Use calendar year boundaries */
    useCalendarYear?: boolean;
    /** Custom start time calculation */
    customStartTime?: (endTime: number) => number;
    /** Custom end time calculation */
    customEndTime?: (endTime: number) => number;
  };
}

/**
 * Period configuration map
 * Single source of truth for all period-specific settings
 * 
 * This is the central configuration object that defines all behavior for each time period.
 * Instead of scattered if/else statements throughout the code, all period-specific logic
 * is defined here. This makes it easy to:
 * - Add new periods
 * - Modify existing period behavior
 * - Understand period-specific requirements at a glance
 * 
 * PERIOD_CONFIG only includes non-null periods (custom ranges use different logic)
 */
type NonNullTimeSeriesPeriod = Exclude<TimeSeriesPeriod, null>;
const PERIOD_CONFIG: Record<NonNullTimeSeriesPeriod, PeriodConfig> = {
  [TIME_SERIES_PERIOD_1H]: {
    aggregationInterval: "minute" as ESPAggregationInterval,
    numIntervals: 60,
    stepMs: MS.MINUTE,
    labelIntervalHours: 6 / 60, // every minute (or handle separately)
    durationMs: MS.HOUR,
    offsetMultiplier: MS.HOUR,
  },
  [TIME_SERIES_PERIOD_1D]: {
    aggregationInterval: "hour" as ESPAggregationInterval,
    numIntervals: 24,
    stepMs: MS.HOUR,
    labelIntervalHours: 4,
    durationMs: MS.DAY,
    offsetMultiplier: MS.DAY,
  },
  [TIME_SERIES_PERIOD_7D]: {
    aggregationInterval: "day" as ESPAggregationInterval,
    numIntervals: 7,
    stepMs: MS.DAY,
    labelIntervalHours: 24, // 1 per day
    durationMs: 7 * MS.DAY,
    offsetMultiplier: 7 * MS.DAY,
  },
  [TIME_SERIES_PERIOD_4W]: {
    aggregationInterval: "day" as ESPAggregationInterval,
    numIntervals: 28,
    stepMs: MS.DAY,
    labelIntervalHours: 24, // 1 per day
    durationMs: 28 * MS.DAY,
    offsetMultiplier: 28 * MS.DAY,
  },
  [TIME_SERIES_PERIOD_1Y]: {
    aggregationInterval: "month" as ESPAggregationInterval,
    numIntervals: 12,
    stepMs: 0, // Use stepUnit instead
    stepUnit: "month",
    labelIntervalHours: 12 * 24, // 1 per month (approx)
    durationMs: 360 * MS.DAY, // 360 days (max for month aggregation)
    offsetMultiplier: 360 * MS.DAY,
    specialRules: {
      maxDurationMs: 360 * MS.DAY,
      useCalendarYear: true,
      customStartTime: (endTime: number) => {
        const endDate = new Date(endTime);
        const year = endDate.getFullYear();
        const startDate = new Date(year, 0, 1); // January 1st
        return alignToBoundary(startDate.getTime(), "day");
      },
      customEndTime: (endTime: number) => {
        const endDate = new Date(endTime);
        const currentYear = new Date().getFullYear();
        const endYear = endDate.getFullYear();
        
        if (endYear === currentYear) {
          return endTime; // Current year: use actual time
        } else {
          // Past year: use December 31st
          const yearEndDate = new Date(endYear, 11, 31);
          return alignToBoundary(yearEndDate.getTime(), "end-of-day");
        }
      },
    },
  },
};

// ============================================================================
// Time Range Calculation (Consolidated)
// ============================================================================

/**
 * Calculates the start time based on the selected period
 * 
 * When users select a time period (1H, 1D, 7D, etc.), we need to calculate the exact start time
 * for that period. This function handles period-specific logic:
 * - 1H: Start 1 hour before end time
 * - 1D: Start at midnight (00:00) of the same day
 * - 7D/4W: Start at midnight of N days before (using date arithmetic for DST safety)
 * - 1Y: Uses custom calendar year boundaries (January 1st)
 * 
 * This is essential for building accurate API requests and ensuring charts display the correct time range.
 * 
 * @param period - The time period (TIME_SERIES_PERIOD_1H, TIME_SERIES_PERIOD_1D, etc.)
 * @param endTime - The end time in milliseconds (defaults to current time)
 * @returns Unix timestamp in milliseconds representing the start of the period
 * @throws TimeSeriesValidationError if period is null
 */
export const calculateStartTime = (
  period: TimeSeriesPeriod | null,
  endTime: number = Date.now()
): number => {
  if (!period) {
    throw new TimeSeriesValidationError("Period is required for calculateStartTime");
  }
  const config = PERIOD_CONFIG[period as NonNullTimeSeriesPeriod];
  
  // Use custom start time calculation if available
  if (config.specialRules?.customStartTime) {
    return config.specialRules.customStartTime(endTime);
  }
  
  // Default calculations based on period
  switch (period) {
    case TIME_SERIES_PERIOD_1H:
      // For 1 hour: startTime should be 1 hour before endTime
      return endTime - MS.HOUR;
    case TIME_SERIES_PERIOD_1D:
      // For 1 day: start at 00:00 of the same day
      return alignToBoundary(endTime, "day");
    case TIME_SERIES_PERIOD_7D: {
      // For 7 days: start at 00:00 of 7 days before (use date arithmetic for DST safety)
      const date = new Date(endTime);
      date.setDate(date.getDate() - 7);
      return alignToBoundary(date.getTime(), "day");
    }
    case TIME_SERIES_PERIOD_4W: {
      // For 4 weeks: start at 00:00 of 28 days before (use date arithmetic for DST safety)
      const date = new Date(endTime);
      date.setDate(date.getDate() - 28);
      return alignToBoundary(date.getTime(), "day");
    }
    default:
      return endTime - MS.DAY;
  }
};

/**
 * Calculates the aligned end time based on the selected period
 * 
 * End times need to be aligned to appropriate boundaries for consistent data retrieval.
 * This function ensures:
 * - 1H period: Uses exact end time (already aligned to hour boundary)
 * - Other periods: Aligns to end of day (23:59:59.999) for complete day coverage
 * - 1Y period: Uses custom logic (current time for current year, Dec 31 for past years)
 * 
 * Proper end time alignment is critical for:
 * - Ensuring we get all data for the selected period
 * - Consistent API request formatting
 * - Accurate chart data display
 * 
 * @param period - The time period (TIME_SERIES_PERIOD_1H, TIME_SERIES_PERIOD_1D, etc.)
 * @param endTime - The end time in milliseconds (defaults to current time)
 * @returns Unix timestamp in milliseconds representing the aligned end of the period
 * @throws TimeSeriesValidationError if period is null
 */
export const calculateEndTime = (
  period: TimeSeriesPeriod | null,
  endTime: number = Date.now()
): number => {
  if (!period) {
    throw new TimeSeriesValidationError("Period is required for calculateEndTime");
  }
  const config = PERIOD_CONFIG[period as NonNullTimeSeriesPeriod];
  
  // Use custom end time calculation if available
  if (config.specialRules?.customEndTime) {
    return config.specialRules.customEndTime(endTime);
  }
  
  // Default calculations
  if (period === TIME_SERIES_PERIOD_1H) {
    // For 1 hour: return as-is (already aligned to hour boundary)
    return endTime;
  }
  
  // For all other periods: align to end of day
  return alignToBoundary(endTime, "end-of-day");
};

/**
 * Calculates time range based on period and offset
 * 
 * Enables navigation through historical periods. Users can view "current period" (offset=0),
 * "previous period" (offset=1), etc. This function:
 * - Calculates the base end time by subtracting offset periods
 * - Handles special cases (1H uses hour boundaries, 1Y uses 360-day calculation)
 * - Returns properly aligned start and end times for the requested period
 * 
 * Used by chart navigation controls to allow users to browse through historical data periods.
 * 
 * @param period - The time period (TIME_SERIES_PERIOD_1H, TIME_SERIES_PERIOD_1D, etc.)
 * @param offset - The offset from current time (0 = current period, 1 = previous period, 2 = 2 periods ago, etc.)
 * @param baseTime - Optional base time in milliseconds (defaults to current time)
 * @returns Object containing startTime and endTime in milliseconds for the requested period
 * @throws TimeSeriesValidationError if period is null
 */
export const getTimeRange = (
  period: TimeSeriesPeriod | null,
  offset: number,
  baseTime: number = Date.now()
): { startTime: number; endTime: number } => {
  if (!period) {
    throw new TimeSeriesValidationError("Period is required for getTimeRange");
  }
  const config = PERIOD_CONFIG[period as NonNullTimeSeriesPeriod];
  let baseEndTime: number;

  // Calculate the base end time by subtracting the offset
  // Normalized offset semantics: offset = 0 → current, offset = 1 → previous, etc.
  switch (period) {
    case TIME_SERIES_PERIOD_1H: {
      // For 1H period, align to hour boundaries
      const alignedBaseTime = alignToBoundary(baseTime, "hour");
      // Normalize: offset 0 = current hour, offset 1 = previous hour, etc.
      // Current hour ends at alignedBaseTime + 1 hour, so subtract offset hours
      baseEndTime = alignedBaseTime + MS.HOUR - offset * MS.HOUR;
      break;
    }
    case TIME_SERIES_PERIOD_1Y: {
      // For 1 year: use 360 days calculation (not calendar years)
      baseEndTime = baseTime - offset * config.offsetMultiplier;
      break;
    }
    default:
      baseEndTime = baseTime - offset * config.offsetMultiplier;
  }

  // Use helper functions to calculate properly aligned start and end times
  const endTime = calculateEndTime(period, baseEndTime);
  let startTime = calculateStartTime(period, endTime);

  // Clamp 1Y period to 350 days - 1 second
  if (period === TIME_SERIES_PERIOD_1Y) {
    const MAX_DURATION_DAYS = 350;
    const MAX_DURATION_MS = MAX_DURATION_DAYS * MS.DAY - MS.SECOND;
    const duration = endTime - startTime;
    
    if (duration > MAX_DURATION_MS) {
      startTime = endTime - MAX_DURATION_MS;
    }
  }

  return { startTime, endTime };
};

/**
 * Formats time in HH:MM AM/PM format
 * 
 * @param date - Date object to format
 * @returns Formatted time string (e.g., "02:30 PM")
 */
const formatTimeHHMM = (date: Date): string => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, "0");
  return `${displayHours.toString().padStart(2, "0")}:${displayMinutes} ${ampm}`;
};

/**
 * Formats date in dd-MMM-YY format
 * 
 * @param date - Date object to format
 * @returns Formatted date string (e.g., "15-Jan-24")
 */
const formatDateDDMMMYY = (date: Date): string => {
  const day = date.getDate().toString().padStart(2, "0");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear().toString().slice(-2);
  return `${day} ${month} ${year}`;
};


/**
 * Formats a timestamp for chart tooltips as "dd-MMM-YY h:mm am/pm"
 * 
 * Chart tooltips need a compact, human-friendly date-time representation that includes
 * both the calendar date and local time. This helper centralizes the formatting so that
 * multiple tooltip components can share the same behavior and avoids duplicating
 * date-handling logic across the codebase.
 * 
 * WORKLET DIRECTIVE: This function is marked as a "worklet" because it's called from
 * `useDerivedValue` in React Native Reanimated, which runs on the UI thread. Functions
 * called from worklets must be marked as worklets themselves to be executed synchronously
 * on the UI thread. Without this directive, Reanimated would throw an error:
 * "Tried to synchronously call a non-worklet function on the UI thread."
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted date-time string (e.g., "15-Jan-24 2:30 pm")
 */
export const formatTooltipDateTime = (timestamp: number): string => {
  "worklet";
  const date = new Date(timestamp);
  const day = date.getDate().toString().padStart(2, "0");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear().toString().slice(-2);

  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  const displayHours = hours % 12 || 12;

  return `${day}-${month}-${year} ${displayHours}:${minutes} ${ampm}`;
};

/**
 * Formats a numeric value for display in chart tooltips with appropriate decimal places
 * 
 * Chart tooltips need numeric values formatted with contextually appropriate precision:
 * - Large values (>= 1000): No decimal places (e.g., "1234")
 * - Medium values (>= 1): 2 decimal places (e.g., "12.34")
 * - Small values (< 1): 4 decimal places (e.g., "0.1234")
 * - Invalid values (NaN): Empty string
 * 
 * This ensures tooltips show readable values without unnecessary precision for large numbers
 * or insufficient precision for small numbers.
 * 
 * WORKLET DIRECTIVE: This function is marked as a "worklet" because it's called from
 * `useDerivedValue` in React Native Reanimated, which runs on the UI thread. Functions
 * called from worklets must be marked as worklets themselves to be executed synchronously
 * on the UI thread. Without this directive, Reanimated would throw an error:
 * "Tried to synchronously call a non-worklet function on the UI thread."
 * 
 * @param value - Numeric value to format
 * @returns Formatted value string with appropriate decimal places, or empty string if NaN
 */
export const formatTooltipValue = (value: number): string => {
  "worklet";
  if (isNaN(value)) {
    return "";
  }
  // Format with appropriate decimal places
  if (Math.abs(value) >= 1000) {
    return value.toFixed(0);
  } else if (Math.abs(value) >= 1) {
    return value.toFixed(2);
  } else {
    return value.toFixed(4);
  }
};

/**
 * Formats time range display based on period and offset
 * 
 * Provides user-friendly date/time range labels for the UI. Different periods need different
 * formatting:
 * - 1H: Shows time range (e.g., "02:30 PM - 03:30 PM") or "Last Hour" for current
 * - 1D: Shows date (e.g., "15-Jan-24") or "Today" for current
 * - 7D/4W: Shows date range (e.g., "01-Jan - 07-Jan") or "Last 7 Days" for current
 * - 1Y: Shows year (e.g., "2024") or "Last Year" for current
 * 
 * This function is used to display the selected time range in chart headers and navigation controls.
 * 
 * @param period - The time period (TIME_SERIES_PERIOD_1H, TIME_SERIES_PERIOD_1D, etc.)
 * @param offset - The offset from current time (0 = current period, 1 = previous period, etc.)
 * @param baseTime - Optional base time in milliseconds (defaults to current time)
 * @param locale - Optional locale string for formatting (defaults to "en-US")
 * @returns Formatted time range string for display in the UI
 */
export const formatTimeRangeDisplay = (
  period: TimeSeriesPeriod | null,
  offset: number,
  baseTime: number = Date.now(),
  _locale: string = "en-US"
): string => {
  if (!period) {
    return "";
  }
  const { startTime, endTime } = getTimeRange(period, offset, baseTime);
  const startDate = new Date(startTime);
  const endDate = new Date(endTime);

  switch (period) {
    case TIME_SERIES_PERIOD_1H:
      if (offset === 0) {
        return TIME_SERIES_LABELS.LAST_HOUR;
      }
      return `${formatTimeHHMM(startDate)} - ${formatTimeHHMM(endDate)}`;
    case TIME_SERIES_PERIOD_1D:
      if (offset === 0) {
        return TIME_SERIES_LABELS.TODAY;
      }
      return formatDateDDMMMYY(startDate);
    case TIME_SERIES_PERIOD_7D:
      if (offset === 0) {
        return TIME_SERIES_LABELS.LAST_7_DAYS;
      }
      return `${formatDateDDMMMYY(startDate)} - ${formatDateDDMMMYY(endDate)}`;
    case TIME_SERIES_PERIOD_4W:
      if (offset === 0) {
        return TIME_SERIES_LABELS.LAST_4_WEEKS;
      }
      return `${formatDateDDMMMYY(startDate)} - ${formatDateDDMMMYY(endDate)}`;
    case TIME_SERIES_PERIOD_1Y:
      if (offset === 0) {
        return TIME_SERIES_LABELS.LAST_YEAR;
      }
      return startDate.getFullYear().toString();
    default:
      return TIME_SERIES_LABELS.CURRENT_PERIOD;
  }
};

/**
 * Gets aggregation interval from period config
 * 
 * Each time period has a corresponding aggregation interval that determines how data is grouped.
 * This mapping is essential for building correct API requests:
 * - 1H period → "minute" aggregation (60 data points per hour)
 * - 1D period → "hour" aggregation (24 data points per day)
 * - 7D/4W period → "day" aggregation (7/28 data points)
 * - 1Y period → "month" aggregation (12 data points per year)
 * 
 * The aggregation interval tells the API how to bucket the data points for efficient retrieval.
 * 
 * @param period - The time period (TIME_SERIES_PERIOD_1H, TIME_SERIES_PERIOD_1D, etc.)
 * @returns Aggregation interval string ("minute", "hour", "day", "month") for the period
 * @throws TimeSeriesValidationError if period is null
 */
export const getAggregationInterval = (period: TimeSeriesPeriod | null): ESPAggregationInterval => {
  if (!period) {
    throw new TimeSeriesValidationError("Period is required for getAggregationInterval");
  }
  return PERIOD_CONFIG[period as NonNullTimeSeriesPeriod].aggregationInterval;
};

/**
 * Gets number of intervals from period config
 * 
 * The API can calculate time ranges automatically when given numIntervals and aggregationInterval.
 * This is used for "current period" requests where we want the API to calculate the range dynamically.
 * Each period has a fixed number of intervals:
 * - 1H: 60 intervals (60 minutes)
 * - 1D: 24 intervals (24 hours)
 * - 7D: 7 intervals (7 days)
 * - 4W: 28 intervals (28 days)
 * - 1Y: 12 intervals (12 months)
 * 
 * This allows the API to handle time zone and DST calculations server-side for current data.
 * 
 * @param period - The time period (TIME_SERIES_PERIOD_1H, TIME_SERIES_PERIOD_1D, etc.)
 * @returns Number of intervals for the period
 * @throws TimeSeriesValidationError if period is null
 */
export const getNumIntervals = (period: TimeSeriesPeriod | null): number => {
  if (!period) {
    throw new TimeSeriesValidationError("Period is required for getNumIntervals");
  }
  return PERIOD_CONFIG[period as NonNullTimeSeriesPeriod].numIntervals;
};

// ============================================================================
// Time Series Request Building
// ============================================================================

/**
 * Validates time series request inputs before processing
 * 
 * Centralizes all input validation logic to ensure requests are valid before
 * building the payload. This follows the fail-fast pattern to catch errors early.
 * 
 * @param params - The time series request parameters
 * @param dataType - Optional parameter data type for validation
 * @throws TimeSeriesValidationError if validation fails
 */
const validateTimeSeriesInputs = (
  params: TimeSeriesRequestParams,
  dataType?: string
): void => {
  const { aggregation, period, startTime, endTime, isSimpleTimeSeries } = params;

  // Validate aggregation compatibility with data type
  if (aggregation && dataType && aggregation !== "raw") {
    validateAggregationForDataType(dataType, aggregation);
  }

  // Validate that required parameters are provided
  if (!isSimpleTimeSeries && aggregation && !period && !startTime && !endTime) {
    throw new TimeSeriesValidationError("Either period or startTime/endTime must be provided");
  }

  if (isSimpleTimeSeries && !period && !startTime && !endTime) {
    throw new TimeSeriesValidationError("Period or startTime/endTime is required for simple time series");
  }
};

/**
 * Builds a simple time series request (no aggregation, no intervals)
 * 
 * Simple time series requests only need startTime and endTime. This function
 * handles both custom date ranges and period-based calculations for simple requests.
 * 
 * @param params - The time series request parameters
 * @returns ESPSimpleTSDataRequest payload
 * @throws TimeSeriesValidationError if period is missing for period-based requests
 */
const buildSimpleTimeSeriesRequest = (
  params: TimeSeriesRequestParams
): ESPSimpleTSDataRequest => {
  const { period, startTime, endTime, resultCount } = params;

  // Custom date range: use provided times directly
  if (startTime && endTime) {
    const simpleRequest: ESPSimpleTSDataRequest = {
      startTime: Math.floor(startTime / 1000),
      endTime: Math.floor(endTime / 1000),
    };
    if (resultCount) {
      simpleRequest.resultCount = resultCount;
    }
    return simpleRequest;
  }

  // Period-based: calculate times from period
  if (!period) {
    throw new TimeSeriesValidationError("Period is required for simple time series without custom range");
  }

  const calculatedEndTime = calculateEndTime(period, endTime);
  const calculatedStartTime = startTime || calculateStartTime(period, calculatedEndTime);

  const simpleRequest: ESPSimpleTSDataRequest = {
    startTime: Math.floor(calculatedStartTime / 1000),
    endTime: Math.floor(calculatedEndTime / 1000),
  };

  if (resultCount) {
    simpleRequest.resultCount = resultCount;
  }

  return simpleRequest;
};

/**
 * Applies max duration cap for period-based requests if configured
 * 
 * Some periods (like 1Y) have special max duration limits that need to be
 * enforced. This function applies those caps to prevent exceeding API limits.
 * 
 * @param period - The time period
 * @param startTime - Calculated start time (may be modified)
 * @param endTime - Calculated end time
 * @returns Adjusted start time if cap was applied, otherwise original start time
 */
const applyMaxDurationCap = (
  period: TimeSeriesPeriod | null,
  startTime: number,
  endTime: number
): number => {
  if (!period) {
    return startTime;
  }

  const config = PERIOD_CONFIG[period as NonNullTimeSeriesPeriod];
  if (!config.specialRules?.maxDurationMs) {
    return startTime;
  }

  const maxDuration = config.specialRules.maxDurationMs;
  const actualDuration = endTime - startTime;
  
  if (actualDuration > maxDuration) {
    return endTime - maxDuration;
  }

  return startTime;
};

/**
 * Calculates time range for aggregated data requests
 * 
 * Aggregated data needs special time range calculation using the aggregation
 * interval state machine. This handles both custom ranges and period-based ranges.
 * 
 * @param params - The time series request parameters
 * @returns Object with calculated startTime and endTime
 * @throws TimeSeriesValidationError if period is missing for period-based requests
 */
const calculateTimeRangeForAggregatedData = (
  params: TimeSeriesRequestParams
): { startTime: number; endTime: number } => {
  const { period, startTime, endTime = Date.now(), aggregationInterval } = params;

  // Custom date range: use provided times directly
  if (startTime && endTime) {
    return { startTime, endTime };
  }

  // Period-based: use period's interval via state machine
  if (!period) {
    throw new TimeSeriesValidationError("Period is required when startTime/endTime are not provided");
  }

  const interval = aggregationInterval || (getAggregationInterval(period) as AggregationIntervalType);
  const timeRange = getTimeRangeForInterval(interval, endTime);

  // Apply max duration cap if configured (only for period-based)
  const adjustedStartTime = applyMaxDurationCap(period, timeRange.startTime, timeRange.endTime);

  return {
    startTime: adjustedStartTime,
    endTime: timeRange.endTime,
  };
};

/**
 * Calculates time range for raw data requests
 * 
 * Raw data uses simpler time range calculation based on periods or custom ranges.
 * This function handles both cases and validates the range doesn't exceed limits.
 * 
 * @param params - The time series request parameters
 * @returns Object with calculated startTime and endTime
 * @throws TimeSeriesValidationError if period is missing or range exceeds limits
 */
const calculateTimeRangeForRawData = (
  params: TimeSeriesRequestParams
): { startTime: number; endTime: number } => {
  const { period, startTime, endTime = Date.now() } = params;

  // Custom range: use provided times
  if (startTime && endTime) {
    return { startTime, endTime };
  }

  // Period-based: use period calculation
  if (!period) {
    throw new TimeSeriesValidationError("Period is required when startTime/endTime are not provided");
  }

  const calculatedEndTime = calculateEndTime(period, endTime);
  const calculatedStartTime = startTime || calculateStartTime(period, calculatedEndTime);

  // Validate raw data time range
  const duration = calculatedEndTime - calculatedStartTime;
  if (duration > RAW_DATA_MAX_INTERVAL) {
    throw new TimeSeriesValidationError(
      `Time range exceeds maximum interval for raw data. Maximum: 31 days, Requested: ${Math.round(duration / MS.DAY)} days`
    );
  }

  return { startTime: calculatedStartTime, endTime: calculatedEndTime };
};

/**
 * Determines if the request is for current data (within 5 minutes of now)
 * 
 * Current data requests can use numIntervals (API calculates range dynamically),
 * while historical data must use explicit startTime/endTime.
 * 
 * @param endTime - The end time in milliseconds
 * @returns True if this is a current data request
 */
const isCurrentDataRequest = (endTime: number): boolean => {
  const now = Date.now();
  return Math.abs(now - endTime) < 5 * MS.MINUTE;
};

/**
 * Determines the aggregation interval for the request
 * 
 * Aggregation interval can come from multiple sources (custom interval, period config).
 * This function determines the correct interval with proper priority.
 * 
 * @param params - The time series request parameters
 * @returns The aggregation interval to use
 * @throws TimeSeriesValidationError if interval cannot be determined
 */
const determinePeriodAggregationInterval = (
  params: TimeSeriesRequestParams
): ESPAggregationInterval => {
  const { period, aggregationInterval } = params;

  if (aggregationInterval) {
    return aggregationInterval as ESPAggregationInterval;
  }

  if (period) {
    return getAggregationInterval(period) as ESPAggregationInterval;
  }

  throw new TimeSeriesValidationError("Either aggregationInterval or period must be provided");
};

/**
 * Builds the aggregated data request payload
 * 
 * Aggregated requests need special handling for current vs historical data.
 * Current data uses numIntervals (API calculates range), historical uses startTime/endTime.
 * 
 * @param params - The time series request parameters
 * @param timeRange - Calculated time range
 * @param baseRequest - Base request object to build upon
 * @returns Complete ESPTSDataRequest for aggregated data
 */
const buildAggregatedRequestPayload = (
  params: TimeSeriesRequestParams,
  timeRange: { startTime: number; endTime: number },
  baseRequest: ESPTSDataRequest
): ESPTSDataRequest => {
  const { period, aggregation, startTime, endTime, aggregationInterval } = params;

  const request = { ...baseRequest };
  request.aggregate = aggregation as ESPAggregationMethod;
  request.aggregationInterval = determinePeriodAggregationInterval(params);

  // Validate time range after computation
  const interval = aggregationInterval || (period ? (getAggregationInterval(period) as AggregationIntervalType) : undefined);
  if (interval) {
    validateTimeRange(interval, timeRange.startTime, timeRange.endTime, aggregation!);
  }

  // Current data with period: use numIntervals (API calculates time range)
  if (period && !startTime && !endTime) {
    request.numIntervals = getNumIntervals(period);
  } else {
    // Historical data or custom range: use startTime/endTime only (no numIntervals)
    request.startTime = Math.floor(timeRange.startTime / 1000);
    request.endTime = Math.floor(timeRange.endTime / 1000);
  }

  return request;
};

/**
 * Builds the raw data request payload
 * 
 * Raw data requests always use startTime/endTime (no numIntervals, no aggregationInterval).
 * This function creates the appropriate payload structure.
 * 
 * @param timeRange - Calculated time range
 * @param baseRequest - Base request object to build upon
 * @returns Complete ESPTSDataRequest for raw data
 */
const buildRawDataRequestPayload = (
  timeRange: { startTime: number; endTime: number },
  baseRequest: ESPTSDataRequest
): ESPTSDataRequest => {
  return {
    ...baseRequest,
    startTime: Math.floor(timeRange.startTime / 1000),
    endTime: Math.floor(timeRange.endTime / 1000),
  };
};

/**
 * Adds optional parameters to the request
 * 
 * Optional parameters (resultCount, timezone) are added to requests.
 * Note: timezone is only available for ESPTSDataRequest, not ESPSimpleTSDataRequest.
 * 
 * @param request - The request object to modify
 * @param params - The time series request parameters
 */
const addOptionalRequestParams = (
  request: ESPTSDataRequest | ESPSimpleTSDataRequest,
  params: TimeSeriesRequestParams
): void => {
  const { resultCount, timezone } = params;

  if (resultCount) {
    request.resultCount = resultCount;
  }

  // timezone is only available for ESPTSDataRequest (not ESPSimpleTSDataRequest)
  if (timezone && 'timezone' in request) {
    (request as ESPTSDataRequest).timezone = timezone;
  }
};

/**
 * Builds a time series data request payload from Chart component parameters
 * Validates inputs first, then computes time ranges
 * 
 * This is the main function that converts UI parameters into API request format. It handles:
 * - Simple time series requests (raw data without aggregation)
 * - Aggregated time series requests (with avg, min, max, etc.)
 * - Period-based requests (using predefined periods like 1H, 1D, 7D)
 * - Custom date range requests (user-selected start/end dates)
 * - Current vs historical data (uses numIntervals for current, startTime/endTime for historical)
 * 
 * The function ensures all requests are properly formatted and validated before sending to the API.
 * It's the bridge between the chart UI and the backend time series API.
 * 
 * @param params - The time series request parameters (period, aggregation, startTime, endTime, etc.)
 * @param dataType - Optional parameter data type for validation (float, int, bool, string)
 * @returns ESPTSDataRequest or ESPSimpleTSDataRequest payload ready for SDK methods
 * @throws TimeSeriesValidationError if validation fails (invalid period, unsupported aggregation, etc.)
 */
export const buildTimeSeriesRequest = (
  params: TimeSeriesRequestParams,
  dataType?: string
): ESPTSDataRequest | ESPSimpleTSDataRequest => {
  const { descOrder = false, isSimpleTimeSeries = false, aggregation } = params;

  // Validate inputs first (fail fast pattern)
  validateTimeSeriesInputs(params, dataType);

  // Handle simple time series requests
  if (isSimpleTimeSeries) {
    return buildSimpleTimeSeriesRequest(params);
  }

  // Build base request
  const baseRequest: ESPTSDataRequest = {
    descOrder,
  };

  // Calculate time range based on aggregation type
  let timeRange: { startTime: number; endTime: number };
  let request: ESPTSDataRequest;

  if (aggregation && aggregation !== "raw") {
    // Aggregated data
    timeRange = calculateTimeRangeForAggregatedData(params);
    request = buildAggregatedRequestPayload(params, timeRange, baseRequest);
  } else {
    // Raw data or no aggregation
    timeRange = calculateTimeRangeForRawData(params);
    request = buildRawDataRequestPayload(timeRange, baseRequest);
  }

  // Add optional parameters
  addOptionalRequestParams(request, params);

  return request;
};

// ============================================================================
// Formatting Helpers (Consolidated)
// ============================================================================

/**
 * Timestamp formatter function type
 * 
 * Defines the signature for timestamp formatting functions used throughout the codebase.
 * Used by getDynamicXLabelFormatter() and other formatting functions to ensure type safety.
 */
type TimestampFormatter = (timestamp: number) => string;

/**
 * Formatter configuration for a period
 * 
 * Each period needs two types of formatters:
 * - formatTimestamp: For general timestamp display (tooltips, data point labels)
 * - formatXAxisLabel: For X-axis labels (may differ from general format for readability)
 * 
 * This interface ensures both formatters are provided together for consistency.
 */
interface FormatterConfig {
  /** Format function for period-specific timestamps */
  formatTimestamp: TimestampFormatter;
  /** Format function for X-axis labels */
  formatXAxisLabel: TimestampFormatter;
}

/**
 * Creates formatter configuration for a period
 * Consolidates formatting logic in one place
 * 
 * Different time periods require different timestamp formatting for readability:
 * - 1H: Show minutes (e.g., "14:30") - users need minute-level precision
 * - 1D: Show hours (e.g., "2 PM") - hourly granularity is sufficient
 * - 7D/4W: Show dates (e.g., "Jan 15") - daily granularity
 * - 1Y: Show months (e.g., "Jan") - monthly granularity
 * 
 * This function centralizes all formatting logic to ensure consistent display across the app.
 * 
 * @param period - The time period (TIME_SERIES_PERIOD_1H, TIME_SERIES_PERIOD_1D, etc.)
 * @param locale - Locale string for formatting (defaults to "en-US")
 * @returns FormatterConfig object with formatTimestamp and formatXAxisLabel functions
 */
const createFormatterForPeriod = (period: TimeSeriesPeriod, locale: string = "en-US"): FormatterConfig => {
  switch (period) {
    case TIME_SERIES_PERIOD_1H:
      return {
        formatTimestamp: (timestamp: number) => {
          return new Date(timestamp).toLocaleTimeString(locale, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
        },
        formatXAxisLabel: (timestamp: number) => {
          return new Date(timestamp).toLocaleTimeString(locale, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
        },
      };
    case TIME_SERIES_PERIOD_1D:
      return {
        formatTimestamp: (timestamp: number) => {
          return new Date(timestamp).toLocaleTimeString(locale, {
            hour: "2-digit",
            hour12: true,
          });
        },
        formatXAxisLabel: (timestamp: number) => {
          return new Date(timestamp).toLocaleTimeString(locale, {
            hour: "numeric",
            hour12: true,
          });
        },
      };
    case TIME_SERIES_PERIOD_7D:
    case TIME_SERIES_PERIOD_4W:
      return {
        formatTimestamp: (timestamp: number) => {
          return new Date(timestamp).toLocaleDateString(locale, {
            day: "numeric",
            month: "short",
          });
        },
        formatXAxisLabel: (timestamp: number) => {
          return new Date(timestamp).toLocaleDateString(locale, {
            weekday: "short",
          });
        },
      };
    case TIME_SERIES_PERIOD_1Y:
      return {
        formatTimestamp: (timestamp: number) => {
          return new Date(timestamp).toLocaleDateString(locale, {
            month: "short",
          });
        },
        formatXAxisLabel: (timestamp: number) => {
          return new Date(timestamp).toLocaleDateString(locale, {
            month: "short",
          });
        },
      };
    default:
      return {
        formatTimestamp: (timestamp: number) => new Date(timestamp).toLocaleString(locale),
        formatXAxisLabel: (timestamp: number) => new Date(timestamp).toLocaleString(locale),
      };
  }
};

/**
 * Helper function to format timestamp for display based on the time period
 * 
 * Chart data points need formatted labels for tooltips and axis labels. This function
 * selects the appropriate format based on the time period to ensure labels are readable
 * and contextually appropriate. For custom ranges (null period), it defaults to day format.
 * 
 * Used throughout the chart rendering pipeline to format timestamps consistently.
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @param period - The time period for context (null for custom ranges)
 * @param locale - Optional locale string for internationalization (defaults to "en-US")
 * @returns Formatted time string appropriate for the period (e.g., "14:30", "2 PM", "Jan 15")
 */
export const formatTimestampForPeriod = (
  timestamp: number,
  period: TimeSeriesPeriod | null,
  locale: string = "en-US"
): string => {
  // For custom range (null period), use a default formatter
  const formatPeriod = period || TIME_SERIES_PERIOD_1D;
  const formatter = createFormatterForPeriod(formatPeriod, locale);
  return formatter.formatTimestamp(timestamp);
};

/**
 * State machine for determining X-axis label format based on visible time range
 * Uses strict zoom breakpoints to prevent label changes during small pans
 * 
 * When users zoom/pan charts, the visible time range changes. The X-axis labels should
 * adapt to show the most appropriate format:
 * - < 6 hours: Show "hh:mm" (minute precision needed)
 * - 6-24 hours: Show "HH am/pm" (hourly precision)
 * - 1-7 days: Show "DDD" (day of week)
 * - 8-31 days: Show "dd MMM" (date and month)
 * - 1-12 months: Show "mmm" (month name)
 * - 1+ years: Show "YYYY" (year)
 * 
 * Strict breakpoints prevent label format from changing during small pans, which would be jarring.
 * This improves UX by providing stable, contextually appropriate labels.
 * 
 * @param visibleStartTime - Start timestamp of visible range in milliseconds
 * @param visibleEndTime - End timestamp of visible range in milliseconds
 * @param locale - Optional locale string for formatting (defaults to "en-US")
 * @returns Format function that takes a timestamp and returns formatted string for X-axis labels
 */
/**
 * Determines the format breakpoint index based on time span
 * Used by chart components to decide when to update X-axis label formatting.
 *
 * Charts may want to minimize re-renders or expensive recalculations when panning/zooming.
 * By mapping a visible time span into a small set of breakpoint buckets, components can:
 * - Detect when the label "mode" has actually changed (e.g., from hours to days)
 * - Ignore small range changes that don't cross a breakpoint
 *
 * Breakpoints (mirrors getDynamicXLabelFormatter):
 * - 0: < 6 hours
 * - 1: 6–24 hours
 * - 2: 1–7 days
 * - 3: 8–31 days
 * - 4: 1–12 months
 * - 5: 1+ years
 *
 * @param timeSpanMs - Time span in milliseconds
 * @returns Breakpoint index (0–5) for format selection
 */
export const getFormatBreakpoint = (timeSpanMs: number): number => {
  const hours = timeSpanMs / MS.HOUR;
  const days = hours / 24;
  const years = days / 365;

  if (hours < 6) return 0;
  if (hours < 24) return 1;
  if (days <= 7) return 2;
  if (days <= 31) return 3;
  if (years < 1) return 4;
  return 5;
};

export const getDynamicXLabelFormatter = (
  visibleStartTime: number,
  visibleEndTime: number,
  locale: string = "en-US"
): TimestampFormatter => {
  const timeSpan = visibleEndTime - visibleStartTime;
  const hours = timeSpan / MS.HOUR;
  const days = hours / 24;
  const years = days / 365;

  // Strict breakpoints to prevent label changes during small pans
  if (hours < 6) {
    // Less than 6 hours visible: show "hh:mm" (24-hour format)
    return (timestamp: number) => {
      return new Date(timestamp).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    };
  } else if (hours < 24) {
    // 6 hours to less than 24 hours visible: show "HH am/pm" format
    return (timestamp: number) => {
      return new Date(timestamp).toLocaleTimeString(locale, {
        hour: "numeric",
        hour12: true,
      });
    };
  } else if (days <= 7) {
    // 1 day to 7 days visible: show "DDD" (day of week)
    return (timestamp: number) => {
      return new Date(timestamp).toLocaleDateString(locale, {
        weekday: "short",
      });
    };
  } else if (days <= 31) {
    // More than 7 days to 31 days visible: show "dd MMM" (date and month)
    return (timestamp: number) => {
      return new Date(timestamp)
        .toLocaleDateString(locale, {
          day: "2-digit",
          month: "short",
        })
        .replace(",", ""); // Ensure format like "15 Jan"
    };
  } else if (years < 1) {
    // More than 31 days but less than 1 year: show "mmm" (month name)
    return (timestamp: number) => {
      return new Date(timestamp).toLocaleDateString(locale, {
        month: "short",
      });
    };
  } else {
    // 1 year or more visible: show "YYYY" (year)
    return (timestamp: number) => {
      return new Date(timestamp).toLocaleDateString(locale, {
        year: "numeric",
      });
    };
  }
};

/**
 * Maps parameter type to its unit symbol
 * 
 * Different sensor parameters have different units that should be displayed with their values.
 * For example, temperature values should show "°" (degree symbol), while other parameters might
 * not need units. This function provides the appropriate unit symbol for each parameter type.
 * 
 * Used in chart Y-axis labels and value displays to show units alongside numeric values.
 * 
 * @param paramType - The parameter type (e.g., "esp.param.temperature", "esp.param.humidity")
 * @returns Unit symbol (e.g., "°" for temperature, empty string for others)
 */
export const getParamUnit = (paramType?: string): string => {
  if (!paramType) {
    return "";
  }

  // Map of parameter types to their unit symbols
  const unitMap: Record<string, string> = {
    [ESPRM_TEMPERATURE_PARAM_TYPE]: "°",
    // Add more mappings here as needed
  };

  return unitMap[paramType] || "";
};

/**
 * Clamps a numeric value between a minimum and maximum value.
 * 
 * Utility function for constraining numeric values within specified bounds.
 * Used throughout chart rendering to ensure visual properties (sizes, widths, etc.)
 * stay within acceptable ranges regardless of input values or zoom levels.
 * 
 * Used by chart components to limit visual element sizes, stroke widths, and other
 * numeric properties to prevent rendering issues or poor visual appearance.
 * 
 * @param value - The value to clamp
 * @param min - The minimum allowed value
 * @param max - The maximum allowed value
 * @returns The clamped value within [min, max]
 */
export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * Scales a base value inversely proportional to zoom scale, then clamps it.
 * As zoom increases, the scaled value decreases. The result is clamped between min and max bounds.
 * 
 * Chart visual elements (points, lines, bars) need to scale inversely with zoom level
 * to maintain readability. When users zoom in, elements should appear smaller to avoid
 * overcrowding. When zoomed out, elements can be larger for visibility.
 * 
 * This function ensures:
 * - Visual elements scale appropriately with zoom level
 * - Values never exceed min/max bounds (prevents rendering issues)
 * - Minimum zoom scale protection (prevents division by zero or extreme values)
 * 
 * Used by chart components to calculate adaptive point radius, stroke width, and bar width
 * based on current zoom level.
 * 
 * @param base - The base value to scale (e.g., point radius, stroke width)
 * @param zoomScale - The current zoom scale factor (typically >= 1)
 * @param min - Minimum allowed value after scaling
 * @param max - Maximum allowed value after scaling
 * @returns The scaled and clamped value
 */
export const scaleByZoom = (
  base: number,
  zoomScale: number,
  min: number,
  max: number,
): number => clamp(base / Math.max(zoomScale, 0.1), min, max);

/**
 * Calculates evenly spaced X-axis tick values from chart data within a visible time range.
 * 
 * Charts need a limited number of X-axis labels (typically 5) to avoid overcrowding.
 * This function filters data points to the visible range and selects evenly spaced timestamps:
 * - If 5 or fewer points exist in the visible range, returns all of them
 * - If more than 5 points exist, selects 5 evenly spaced ones (first, 3 evenly distributed middle ones, last)
 * 
 * This ensures charts display readable X-axis labels regardless of zoom level or data density.
 * Used by chart components to generate tick values for X-axis rendering.
 * 
 * @param chartData - Array of data points with timestamp property
 * @param visibleStartTime - Start timestamp of visible range in milliseconds (or null to use dataStartTime)
 * @param visibleEndTime - End timestamp of visible range in milliseconds (or null to use dataEndTime)
 * @param dataStartTime - Fallback start time if visibleStartTime is null
 * @param dataEndTime - Fallback end time if visibleEndTime is null
 * @returns Array of timestamp values for X-axis ticks (maximum 5, evenly spaced)
 */
export const calculateEvenlySpacedTickValues = <T extends { timestamp: number }>(
  chartData: T[],
  visibleStartTime: number | null,
  visibleEndTime: number | null,
  dataStartTime: number,
  dataEndTime: number
): number[] => {
  const visibleStart = visibleStartTime ?? dataStartTime;
  const visibleEnd = visibleEndTime ?? dataEndTime;
  
  // Filter data points to visible range and extract timestamps
  const filteredTimestamps = chartData
    .filter(
      (item) => item.timestamp >= visibleStart && item.timestamp <= visibleEnd
    )
    .map((item) => item.timestamp);
  
  // If 5 or fewer timestamps, return all of them
  if (filteredTimestamps.length <= 5) {
    return filteredTimestamps;
  }
  
  // Otherwise, select 5 evenly spaced timestamps
  const indices = [0]; // Always include first timestamp
  
  // Add 3 evenly distributed middle indices
  for (let i = 1; i < 4; i++) {
    const index = Math.floor((i / 4) * (filteredTimestamps.length - 1));
    indices.push(index);
  }
  
  // Always include last timestamp
  indices.push(filteredTimestamps.length - 1);
  
  // Remove duplicates and sort (in case of edge cases)
  const uniqueIndices = [...new Set(indices)].sort((a, b) => a - b);
  
  return uniqueIndices.map((idx) => filteredTimestamps[idx]);
};

// ============================================================================
// Aggregation Interval State Machine
// ============================================================================

/**
 * Data type compatibility with aggregation methods
 * 
 * Defines which aggregation methods are valid for each data type. This prevents
 * invalid API requests (e.g., trying to calculate "average" of boolean values).
 * Used by validateAggregationForDataType() to enforce type safety.
 */
const DATA_TYPE_AGGREGATION_MAP: Record<string, AggregationMethod[]> = {
  [DATA_TYPE_FLOAT]: ["raw", "avg", "min", "max", "count", "latest"],
  [DATA_TYPE_INT]: ["raw", "avg", "min", "max", "count", "latest"],
  [DATA_TYPE_BOOL]: ["raw", "latest", "count"],
  [DATA_TYPE_STRING]: ["raw", "latest", "count"],
};

/**
 * Interval limits in milliseconds
 * 
 * Each aggregation interval has a maximum duration limit enforced by the API.
 * These limits prevent requests that would be too large or unsupported. Used by
 * validateTimeRange() to check if a time range is valid before making API requests.
 */
const INTERVAL_LIMITS: Record<AggregationIntervalType, number> = {
  minute: MS.DAY, // 1 day or 1440 minutes
  hour: MS.DAY, // 1 day or 24 hours
  day: 31 * MS.DAY, // 31 days
  week: 12 * 7 * MS.DAY, // 12 weeks
  month: 360 * MS.DAY, // 360 days maximum (for year aggregation)
  year: 5 * MS.YEAR_APPROX, // 5 years (approximate)
};

/**
 * Raw data max interval (31 days)
 * 
 * Raw (unaggregated) data has a special limit of 31 days, which is stricter than
 * aggregated data limits. This prevents requesting too much raw data at once, which
 * would be inefficient and potentially cause performance issues.
 */
const RAW_DATA_MAX_INTERVAL = 31 * MS.DAY;

/**
 * Aggregation interval state machine configuration
 * Each state defines how to calculate start and end times for that interval
 * 
 * The state machine pattern centralizes time range calculation logic for each
 * aggregation interval. Each interval has:
 * - calculateStartTime: How to compute start time from end time
 * - calculateEndTime: How to align/calculate end time
 * - maxDuration: Maximum allowed duration for validation
 * - weekStart: Optional week start day for week intervals
 * 
 * This makes it easy to add new intervals or modify existing ones.
 */
interface IntervalState {
  /** Calculate start time based on end time */
  calculateStartTime: (endTime: number) => number;
  /** Calculate end time (may align to boundaries) */
  calculateEndTime: (endTime: number) => number;
  /** Maximum allowed duration in milliseconds */
  maxDuration: number;
  /** Week start day (0 = Sunday, 1 = Monday, etc.) - only for week interval */
  weekStart?: number;
}

/**
 * Aggregation interval state machine
 * Maps each interval type to its time calculation logic
 * 
 * This state machine defines how each aggregation interval calculates its time range.
 * Used by getTimeRangeForInterval() when users select custom date ranges with specific
 * aggregation intervals. Each interval has different calculation rules:
 * - hour: Start of day to end of day
 * - day: 7 days back (including end date)
 * - week: 4 weeks back (28 days)
 * - month: 12 months back
 * - year: 360 days back (API limit)
 * - minute: 1 hour back
 * 
 * This ensures custom ranges align properly with aggregation boundaries.
 */
const AGGREGATION_INTERVAL_STATE_MACHINE: Record<AggregationIntervalType, IntervalState> = {
  hour: {
    calculateStartTime: (endTime: number) => alignToBoundary(endTime, "day"),
    calculateEndTime: (endTime: number) => alignToBoundary(endTime, "end-of-day"),
    maxDuration: INTERVAL_LIMITS.hour,
  },
  day: {
    calculateStartTime: (endTime: number) => {
      // endDate - 6 days = 7 days total including endDate (use date arithmetic for DST safety)
      const date = new Date(endTime);
      date.setDate(date.getDate() - 6);
      return alignToBoundary(date.getTime(), "day");
    },
    calculateEndTime: (endTime: number) => alignToBoundary(endTime, "end-of-day"),
    maxDuration: INTERVAL_LIMITS.day,
  },
  week: {
    calculateStartTime: (endTime: number) => {
      // endDate - 27 days = 28 days total (4 weeks) (use date arithmetic for DST safety)
      const date = new Date(endTime);
      date.setDate(date.getDate() - 27);
      return alignToBoundary(date.getTime(), "week", 1); // Monday as week start
    },
    calculateEndTime: (endTime: number) => alignToBoundary(endTime, "end-of-day"),
    maxDuration: INTERVAL_LIMITS.week,
    weekStart: 1, // Monday
  },
  month: {
    calculateStartTime: (endTime: number) => {
      // 11 months before current month start
      const date = new Date(endTime);
      date.setMonth(date.getMonth() - 11);
      return alignToBoundary(date.getTime(), "month");
    },
    calculateEndTime: (endTime: number) => alignToBoundary(endTime, "end-of-month"),
    maxDuration: INTERVAL_LIMITS.month,
  },
  year: {
    calculateStartTime: (endTime: number) => {
      // 360 days - 1 second before current date (to stay within month aggregation limit)
      return endTime - (360 * MS.DAY - MS.SECOND);
    },
    calculateEndTime: (endTime: number) => endTime, // Current date (no alignment)
    maxDuration: INTERVAL_LIMITS.year,
  },
  minute: {
    calculateStartTime: (endTime: number) => endTime - MS.HOUR, // Relative time (endTime - 1 hour)
    calculateEndTime: (endTime: number) => endTime, // Use exact endTime (no alignment)
    maxDuration: INTERVAL_LIMITS.minute,
  },
};


/**
 * Validates if a data type supports the given aggregation method
 * 
 * Not all aggregation methods make sense for all data types:
 * - Float/Int: Support avg, min, max, count, latest, raw
 * - Bool/String: Only support count, latest, raw (no avg/min/max)
 * 
 * This validation prevents invalid API requests and provides clear error messages to users
 * when they try to use unsupported aggregations (e.g., "average" for boolean values).
 * 
 * @param dataType - The parameter data type ("float", "int", "bool", "string")
 * @param aggregation - The aggregation method to validate
 * @throws TimeSeriesValidationError if the aggregation method is not supported for the data type
 */
export const validateAggregationForDataType = (
  dataType: string | undefined,
  aggregation: AggregationMethod
): void => {
  if (!dataType) {
    return; // Skip validation if data type is unknown
  }

  const normalizedDataType = dataType.toLowerCase();
  const supportedAggregations = DATA_TYPE_AGGREGATION_MAP[normalizedDataType];

  if (!supportedAggregations) {
    // Unknown data type - allow all aggregations (backward compatibility)
    return;
  }

  if (!supportedAggregations.includes(aggregation)) {
    throw new TimeSeriesValidationError(
      `Aggregation method "${aggregation}" is not supported for data type "${dataType}". Supported methods: ${supportedAggregations.join(", ")}`
    );
  }
};

/**
 * Validates the time range for a given aggregation interval
 * 
 * Each aggregation interval has maximum duration limits enforced by the API:
 * - minute: 1 day max
 * - hour: 1 day max
 * - day: 31 days max
 * - week: 12 weeks max
 * - month: 360 days max
 * - year: 5 years max
 * - raw data: 31 days max (special limit)
 * 
 * This validation prevents API errors by catching invalid time ranges before making requests.
 * It also ensures endTime > startTime to prevent invalid queries.
 * 
 * @param interval - The aggregation interval type ("minute", "hour", "day", "week", "month", "year")
 * @param startTime - Start time in milliseconds
 * @param endTime - End time in milliseconds
 * @param aggregation - The aggregation method (raw has different limits than aggregated data)
 * @throws TimeSeriesValidationError if validation fails (invalid range, exceeds limits, etc.)
 */
export const validateTimeRange = (
  interval: AggregationIntervalType,
  startTime: number,
  endTime: number,
  aggregation: AggregationMethod
): void => {
  // Validate that endTime is strictly greater than startTime
  if (endTime <= startTime) {
    throw new TimeSeriesValidationError(
      `End time must be strictly greater than start time. Start: ${new Date(startTime).toISOString()}, End: ${new Date(endTime).toISOString()}`
    );
  }

  // Calculate duration
  const duration = endTime - startTime;

  // For raw data, use special limit (31 days)
  if (aggregation === "raw") {
    if (duration > RAW_DATA_MAX_INTERVAL) {
      throw new TimeSeriesValidationError(
        `Time range exceeds maximum interval for raw data. Maximum: 31 days, Requested: ${Math.round(duration / MS.DAY)} days`
      );
    }
    return;
  }

  // Get max duration for the interval
  const state = AGGREGATION_INTERVAL_STATE_MACHINE[interval];
  if (!state) {
    throw new TimeSeriesValidationError(`Unknown aggregation interval: ${interval}`);
  }

  if (duration > state.maxDuration) {
    const maxDays = Math.round(state.maxDuration / MS.DAY);
    const requestedDays = Math.round(duration / MS.DAY);
    throw new TimeSeriesValidationError(
      `Time range exceeds maximum interval for "${interval}" aggregation. Maximum: ${maxDays} days, Requested: ${requestedDays} days`
    );
  }
};

/**
 * Gets the time range for a given aggregation interval using the state machine
 * 
 * When users select a custom date range with a specific aggregation interval, we need to
 * calculate the appropriate time range. The state machine defines how each interval calculates
 * its range:
 * - hour: Start of day to end of day
 * - day: 7 days back (including end date)
 * - week: 4 weeks back (28 days)
 * - month: 12 months back
 * - year: 360 days back (API limit)
 * - minute: 1 hour back
 * 
 * This ensures custom ranges align properly with aggregation boundaries for accurate data retrieval.
 * 
 * @param interval - The aggregation interval type ("minute", "hour", "day", "week", "month", "year")
 * @param endTime - The end time in milliseconds (defaults to current time)
 * @param weekStart - Optional week start day (0 = Sunday, 1 = Monday, etc.) for week interval
 * @returns Object containing startTime and endTime in milliseconds for the interval
 * @throws TimeSeriesValidationError if interval is unknown
 */
export const getTimeRangeForInterval = (
  interval: AggregationIntervalType,
  endTime: number = Date.now(),
  weekStart?: number
): { startTime: number; endTime: number } => {
  const state = AGGREGATION_INTERVAL_STATE_MACHINE[interval];
  if (!state) {
    throw new TimeSeriesValidationError(`Unknown aggregation interval: ${interval}`);
  }

  // Use provided weekStart or default from state
  const effectiveWeekStart = weekStart !== undefined ? weekStart : state.weekStart;

  // For week interval, we need to recalculate with custom weekStart if provided
  if (interval === "week" && effectiveWeekStart !== undefined) {
    const calculatedEndTime = state.calculateEndTime(endTime);
    // Recalculate start time with custom weekStart (use date arithmetic for DST safety)
    const date = new Date(calculatedEndTime);
    date.setDate(date.getDate() - 27);
    const calculatedStartTime = alignToBoundary(date.getTime(), "week", effectiveWeekStart);
    return { startTime: calculatedStartTime, endTime: calculatedEndTime };
  }

  const calculatedEndTime = state.calculateEndTime(endTime);
  const calculatedStartTime = state.calculateStartTime(calculatedEndTime);

  return { startTime: calculatedStartTime, endTime: calculatedEndTime };
};

/**
 * Validates if a period and aggregation combination is supported for a given duration
 * 
 * Comprehensive validation function that checks:
 * 1. Data type compatibility with aggregation method
 * 2. Time range validity (endTime > startTime)
 * 3. Time range duration limits for the aggregation interval
 * 
 * This is a convenience function that combines multiple validations to ensure a complete
 * time series request is valid before sending to the API. Used as a final validation step.
 * 
 * @param period - The time period (TIME_SERIES_PERIOD_1H, TIME_SERIES_PERIOD_1D, etc.)
 * @param aggregation - The aggregation method ("raw", "avg", "min", "max", etc.)
 * @param startTime - Start time in milliseconds
 * @param endTime - End time in milliseconds
 * @param dataType - Optional parameter data type for validation ("float", "int", "bool", "string")
 * @param aggregationInterval - Optional aggregation interval (if provided, used instead of period-based interval)
 * @throws TimeSeriesValidationError if validation fails (unsupported aggregation, invalid range, etc.)
 */
export const validateTimeSeriesRequest = (
  period: TimeSeriesPeriod | null,
  aggregation: AggregationMethod,
  startTime: number,
  endTime: number,
  dataType?: string,
  aggregationInterval?: AggregationIntervalType
): void => {
  // Validate data type compatibility
  if (dataType && aggregation !== "raw") {
    validateAggregationForDataType(dataType, aggregation);
  }

  // Use provided aggregation interval if available, otherwise derive from period
  if (!aggregationInterval && !period) {
    throw new TimeSeriesValidationError("Either aggregationInterval or period must be provided for validation");
  }
  const interval = aggregationInterval || (getAggregationInterval(period!) as AggregationIntervalType);

  // Validate time range
  validateTimeRange(interval, startTime, endTime, aggregation);
};

// ============================================================================
// Interpolation Interval Helper
// ============================================================================

/**
 * Determines the appropriate aggregation interval for data interpolation
 * 
 * When interpolating chart data (filling missing values), we need to know the interval
 * between expected data points. This function determines the correct interval with priority:
 * 1. requestInterval (from API response)
 * 2. aggregationInterval (from custom range selection)
 * 3. period-based interval (from period selection)
 * 4. Default to "hour" for custom ranges
 * 
 * Raw data always uses "minute" interval for fine-grained interpolation.
 * This ensures interpolation generates timestamps at the correct granularity.
 * 
 * @param aggregation - The aggregation method ("raw" always uses "minute", others use provided interval)
 * @param requestInterval - Optional aggregation interval from the API request/response
 * @param aggregationInterval - Optional aggregation interval parameter from custom range
 * @param period - Optional time series period (used to derive interval if others not provided)
 * @returns Aggregation interval type ("minute", "hour", "day", "week", "month", "year") for interpolation
 */
export const getInterpolationInterval = (
  aggregation: AggregationMethod,
  requestInterval?: ESPAggregationInterval,
  aggregationInterval?: AggregationIntervalType,
  period?: TimeSeriesPeriod | null
): AggregationIntervalType => {
  // For raw data, always use minute interval
  if (aggregation === "raw") {
    return "minute";
  }

  // Priority order: requestInterval > aggregationInterval > period > default
  if (requestInterval) {
    return requestInterval as AggregationIntervalType;
  }

  if (aggregationInterval) {
    return aggregationInterval;
  }

  if (period) {
    try {
      return getAggregationInterval(period) as AggregationIntervalType;
    } catch {
      // Fall through to default
      if(__DEV__) {
        console.error(`Unknown aggregation interval: ${period}`);
      }
    }
  }

  // Default to hour for custom range without interval
  return "hour";
};

// ============================================================================
// Data Interpolation Helpers
// ============================================================================

/**
 * Generates expected timestamps for interpolation based on aggregation interval
 * 
 * - minute: Every minute
 * - hour: Every hour
 * - day: Every day (using date arithmetic for DST safety)
 * - week: Every week (7 days)
 * - month: Every month
 * - year: Every year
 * 
 * Uses date arithmetic for day/week/month/year to handle DST transitions correctly.
 * 
 * @param startTime - Start timestamp in milliseconds
 * @param endTime - End timestamp in milliseconds
 * @param aggregationInterval - Aggregation interval ("minute", "hour", "day", "week", "month", "year")
 * @returns Array of expected timestamps in milliseconds for the interval
 * @throws TimeSeriesValidationError if aggregation interval is unknown
 */
export const generateExpectedTimestampsForInterval = (
  startTime: number,
  endTime: number,
  aggregationInterval: AggregationIntervalType
): number[] => {
  const timestamps: number[] = [];

  switch (aggregationInterval) {
    case "minute": {
      // Generate timestamps every minute
      let current = startTime;
      while (current <= endTime) {
        timestamps.push(current);
        current += MS.MINUTE;
      }
      break;
    }
    case "hour": {
      // Generate timestamps every hour
      let current = startTime;
      while (current <= endTime) {
        timestamps.push(current);
        current += MS.HOUR;
      }
      break;
    }
    case "day": {
      // Generate timestamps every day (using date arithmetic for DST safety)
      let current = new Date(startTime);
      while (current.getTime() <= endTime) {
        timestamps.push(current.getTime());
        const next = new Date(current);
        next.setDate(next.getDate() + 1);
        current = next;
      }
      break;
    }
    case "month": {
      // Generate timestamps every month
      let current = new Date(startTime);
      while (current.getTime() <= endTime) {
        timestamps.push(current.getTime());
        current = new Date(current);
        current.setMonth(current.getMonth() + 1);
      }
      break;
    }
    case "year": {
      // Generate timestamps every year
      let current = new Date(startTime);
      while (current.getTime() <= endTime) {
        timestamps.push(current.getTime());
        current = new Date(current);
        current.setFullYear(current.getFullYear() + 1);
      }
      break;
    }
    case "week": {
      // Generate timestamps every week (using date arithmetic for DST safety)
      let current = new Date(startTime);
      while (current.getTime() <= endTime) {
        timestamps.push(current.getTime());
        const next = new Date(current);
        next.setDate(next.getDate() + 7);
        current = next;
      }
      break;
    }
    default:
      throw new TimeSeriesValidationError(`Unknown aggregation interval: ${aggregationInterval}`);
  }

  // Ensure last point is included (avoid floating point issues)
  if (timestamps.length === 0 || timestamps[timestamps.length - 1] !== endTime) {
    timestamps.push(endTime);
  }

  return timestamps;
};

/**
 * Calculates the time interval (start and end) for a given expected timestamp based on period
 * Uses PERIOD_CONFIG to determine interval size
 * 
 * When matching API data points to expected timestamps, we need to know the time interval
 * each timestamp represents. For example, if we expect a timestamp at "Jan 1, 00:00", the interval
 * might be "Jan 1, 00:00" to "Jan 1, 01:00" for hourly aggregation.
 * 
 * This function calculates the interval boundaries for each expected timestamp, which is used
 * to determine which API data points belong to which expected timestamp during interpolation.
 * 
 * @param expectedTimestamp - The expected timestamp in milliseconds
 * @param period - Time series period (TIME_SERIES_PERIOD_1H, TIME_SERIES_PERIOD_1D, etc.)
 * @returns Object with intervalStart and intervalEnd in milliseconds for the timestamp
 * @throws TimeSeriesValidationError if period is null
 */
export const getIntervalForTimestamp = (
  expectedTimestamp: number,
  period: TimeSeriesPeriod | null
): { intervalStart: number; intervalEnd: number } => {
  if (!period) {
    throw new TimeSeriesValidationError("Period is required for getIntervalForTimestamp");
  }
  const config = PERIOD_CONFIG[period as NonNullTimeSeriesPeriod];
  const intervalStart = expectedTimestamp;
  let intervalEnd: number;

  // Handle month-based intervals separately
  if (config.stepUnit === "month") {
    const date = new Date(expectedTimestamp);
    const nextMonth = new Date(date);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    intervalEnd = nextMonth.getTime();
  } else {
    // For fixed step sizes
    intervalEnd = expectedTimestamp + config.stepMs;
  }

  return { intervalStart, intervalEnd };
};

/**
 * Calculates the time interval (start and end) for a given expected timestamp based on aggregation interval
 * 
 * Similar to getIntervalForTimestamp, but works with aggregation intervals directly.
 * Calculates the time window that each expected timestamp represents:
 * - minute: 1 minute window
 * - hour: 1 hour window
 * - day: 1 day window (using date arithmetic for DST)
 * - week: 7 day window
 * - month: 1 month window
 * - year: 1 year window
 * 
 * Used during interpolation to match API data points to their corresponding expected timestamps.
 * 
 * @param expectedTimestamp - The expected timestamp in milliseconds
 * @param aggregationInterval - Aggregation interval ("minute", "hour", "day", "week", "month", "year")
 * @returns Object with intervalStart and intervalEnd in milliseconds for the timestamp
 * @throws TimeSeriesValidationError if aggregation interval is unknown
 */
export const getIntervalForAggregationInterval = (
  expectedTimestamp: number,
  aggregationInterval: AggregationIntervalType
): { intervalStart: number; intervalEnd: number } => {
  const intervalStart = expectedTimestamp;
  let intervalEnd: number;

  switch (aggregationInterval) {
    case "minute":
      intervalEnd = expectedTimestamp + MS.MINUTE;
      break;
    case "hour":
      intervalEnd = expectedTimestamp + MS.HOUR;
      break;
    case "day": {
      // Use date arithmetic for DST safety
      const date = new Date(expectedTimestamp);
      date.setDate(date.getDate() + 1);
      intervalEnd = date.getTime();
      break;
    }
    case "week": {
      // Use date arithmetic for DST safety
      const date = new Date(expectedTimestamp);
      date.setDate(date.getDate() + 7);
      intervalEnd = date.getTime();
      break;
    }
    case "month": {
      const date = new Date(expectedTimestamp);
      const nextMonth = new Date(date);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      intervalEnd = nextMonth.getTime();
      break;
    }
    case "year": {
      const date = new Date(expectedTimestamp);
      const nextYear = new Date(date);
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      intervalEnd = nextYear.getTime();
      break;
    }
    default:
      throw new TimeSeriesValidationError(`Unknown aggregation interval: ${aggregationInterval}`);
  }

  return { intervalStart, intervalEnd };
};

/**
 * Builds a map of expected timestamps to their time intervals
 * 
 * Each expected timestamp represents a time interval (e.g., "Jan 1, 00:00" to "Jan 1, 01:00").
 * This map is used to determine which API data points belong to which expected timestamp
 * during the interpolation process.
 * 
 * @param expectedTimestamps - Expected timestamps for the time range
 * @param period - Time series period (for interval calculation)
 * @param aggregationInterval - Optional aggregation interval (if provided, used instead of period)
 * @returns Map of expected timestamp -> { intervalStart, intervalEnd }
 * @throws TimeSeriesValidationError if period and aggregationInterval are both null
 */
const buildIntervalMap = (
  expectedTimestamps: number[],
  period: TimeSeriesPeriod | null,
  aggregationInterval?: AggregationIntervalType
): Map<number, { intervalStart: number; intervalEnd: number }> => {
  const intervalMap = new Map<number, { intervalStart: number; intervalEnd: number }>();
  
  expectedTimestamps.forEach((expectedTimestamp) => {
    let interval: { intervalStart: number; intervalEnd: number };
    
    if (aggregationInterval) {
      interval = getIntervalForAggregationInterval(expectedTimestamp, aggregationInterval);
    } else {
      if (!period) {
        throw new TimeSeriesValidationError("Either period or aggregationInterval must be provided for interpolateData");
      }
      interval = getIntervalForTimestamp(expectedTimestamp, period);
    }
    
    intervalMap.set(expectedTimestamp, interval);
  });

  return intervalMap;
};

/**
 * Buckets data points to their corresponding expected timestamps based on interval boundaries
 * 
 * API data points need to be matched to expected timestamps. A data point belongs to an
 * expected timestamp if it falls within that timestamp's time interval. This function performs
 * this matching efficiently by iterating through intervals sequentially.
 * 
 * @param chartData - Original chart data points from API response
 * @param expectedTimestamps - Expected timestamps for the time range
 * @param intervalMap - Map of expected timestamp -> { intervalStart, intervalEnd }
 * @param endTime - End time for the range (used for last interval boundary)
 * @returns Map of expected timestamp -> ChartDataPoint (only for timestamps that have data)
 */
const bucketDataPointsToIntervals = (
  chartData: ChartDataPoint[],
  expectedTimestamps: number[],
  intervalMap: Map<number, { intervalStart: number; intervalEnd: number }>,
  endTime: number
): Map<number, ChartDataPoint> => {
  const expectedToDataPoint = new Map<number, ChartDataPoint>();
  
  chartData.forEach((dataPoint) => {
    const dataTimestamp = dataPoint.timestamp;

    if (dataTimestamp === undefined || dataTimestamp === null) {
      return;
    }

    // Find which expected timestamp's interval this data point belongs to
    // Since intervals are sequential, we can optimize by checking in order
    for (let i = 0; i < expectedTimestamps.length; i++) {
      const expectedTimestamp = expectedTimestamps[i];
      const isLast = i === expectedTimestamps.length - 1;
      const interval = intervalMap.get(expectedTimestamp);
      
      if (!interval) {
        continue;
      }

      // Check if data point falls within this interval
      if (
        dataTimestamp >= interval.intervalStart &&
        (dataTimestamp < interval.intervalEnd || (isLast && dataTimestamp <= endTime))
      ) {
        // Only assign if not already assigned (first match wins)
        if (!expectedToDataPoint.has(expectedTimestamp)) {
          expectedToDataPoint.set(expectedTimestamp, dataPoint);
        }
        break; // Found the interval, no need to check further
      }
    }
  });

  return expectedToDataPoint;
};

/**
 * Builds the final interpolated data array with null values for missing data points
 * 
 * Charts need complete time ranges with consistent timestamp spacing. This function
 * creates the final array where:
 * - Timestamps with data use the actual data point (with expected timestamp for spacing)
 * - Timestamps without data use null values (shown as gaps in line charts)
 * 
 * @param expectedTimestamps - Expected timestamps for the time range
 * @param expectedToDataPoint - Map of expected timestamp -> ChartDataPoint (only for timestamps with data)
 * @param period - Time series period (for label formatting)
 * @returns Interpolated chart data array ready for chart rendering
 */
const buildInterpolatedDataArray = (
  expectedTimestamps: number[],
  expectedToDataPoint: Map<number, ChartDataPoint>,
  period: TimeSeriesPeriod | null
): ChartDataPoint[] => {
  const interpolatedData: ChartDataPoint[] = [];
  const formatPeriod = period || TIME_SERIES_PERIOD_1D;
  
  expectedTimestamps.forEach((expectedTimestamp) => {
    const assignedPoint = expectedToDataPoint.get(expectedTimestamp);

    if (assignedPoint) {
      // Use actual data point
      interpolatedData.push({
        ...assignedPoint,
        label: formatTimestampForPeriod(expectedTimestamp, formatPeriod),
        timestamp: expectedTimestamp, // Use expected timestamp for consistent spacing
      });
    } else {
      // No data point found - create null value point for missing data
      interpolatedData.push({
        value: null,
        label: formatTimestampForPeriod(expectedTimestamp, formatPeriod),
        timestamp: expectedTimestamp,
      });
    }
  });

  return interpolatedData;
};

/**
 * Interpolates data points to fill missing values in the expected time range
 * This ensures the chart shows the complete time range even when data is sparse
 * Optimized from O(n²) to O(n) by pre-bucketing data points
 * 
 * API responses may have gaps (missing data points), but charts need complete time ranges
 * for proper visualization. This function:
 * 1. Generates all expected timestamps for the time range
 * 2. Matches API data points to expected timestamps based on interval boundaries
 * 3. Fills missing timestamps with null values
 * 
 * This ensures charts display:
 * - Complete time ranges (no gaps in X-axis)
 * - Null values for missing data (shown as gaps in line charts)
 * - Consistent timestamp spacing for proper chart rendering
 * 
 * The O(n) optimization uses pre-bucketing to avoid nested loops when matching data points.
 * 
 * @param chartData - Original chart data points from API response
 * @param expectedTimestamps - Expected timestamps for the time range (from generateExpectedTimestamps)
 * @param period - Time series period (for label formatting)
 * @param endTime - End time for the range (used for last interval boundary)
 * @param aggregationInterval - Optional aggregation interval (if provided, used for interval calculation instead of period)
 * @returns Interpolated chart data with null values for missing data points, ready for chart rendering
 * @throws TimeSeriesValidationError if period and aggregationInterval are both null
 */
export const interpolateData = (
  chartData: ChartDataPoint[],
  expectedTimestamps: number[],
  period: TimeSeriesPeriod | null,
  endTime: number,
  aggregationInterval?: AggregationIntervalType
): ChartDataPoint[] => {
  // Early return for empty timestamps
  if (expectedTimestamps.length === 0) {
    return [];
  }

  // Step 1: Pre-compute intervals for all expected timestamps (O(n))
  const intervalMap = buildIntervalMap(expectedTimestamps, period, aggregationInterval);

  // Step 2: Pre-bucket data points by interval (O(n) - single pass)
  const expectedToDataPoint = bucketDataPointsToIntervals(
    chartData,
    expectedTimestamps,
    intervalMap,
    endTime
  );

  // Step 3: Build final interpolated array (O(n))
  return buildInterpolatedDataArray(expectedTimestamps, expectedToDataPoint, period);
};

// ============================================================================
// Date Range Navigation Helpers
// ============================================================================

/**
 * Formats a date range for display
 * 
 * Custom date ranges selected by users need to be displayed in a readable format.
 * This function creates a simple "Start Date - End Date" string for display in UI components
 * like date pickers and chart headers.
 * 
 * Used when users select custom date ranges (not predefined periods) to show the selected range.
 * 
 * @param startTime - Start timestamp in milliseconds
 * @param endTime - End timestamp in milliseconds
 * @param locale - Optional locale string for formatting (defaults to "en-US")
 * @returns Formatted date range string (e.g., "1/1/2024 - 1/7/2024")
 */
export const formatDateRangeForDisplay = (
  startTime: number,
  endTime: number,
  _locale: string = "en-US"
): string => {
  const startDate = new Date(startTime);
  const endDate = new Date(endTime);

  // If the range is a single day, follow the same rule as 1D in formatTimeRangeDisplay
  if (startDate.toDateString() === endDate.toDateString()) {
    return formatDateDDMMMYY(startDate);
  }

  // For multi‑day ranges, follow the same rule as 7D/4W in formatTimeRangeDisplay
  return `${formatDateDDMMMYY(startDate)} - ${formatDateDDMMMYY(endDate)}`;
};

/**
 * Calculates the previous date range by sliding the window backward
 * 
 * Enables navigation through historical custom date ranges. When users click "Previous",
 * this function slides the time window backward by the same duration, maintaining the range size.
 * 
 * Used by date range navigation controls to allow users to browse through historical periods
 * while keeping the same time window size.
 * 
 * @param range - Current date range object with start, end, and aggregationInterval
 * @returns Previous date range with same duration, shifted backward in time
 */
export const calculatePreviousDateRange = (range: DateRange): DateRange => {
  let rangeDuration = range.end - range.start;
  
  // Clamp duration to 350 days - 1 second if year interval is not selected
  const MAX_DURATION_DAYS = 350;
  const MAX_DURATION_MS = MAX_DURATION_DAYS * MS.DAY - MS.SECOND;
  if (rangeDuration > MAX_DURATION_MS && range.aggregationInterval !== "year") {
    rangeDuration = MAX_DURATION_MS;
  }
  
  return {
    start: range.start - rangeDuration,
    end: range.end - rangeDuration,
    aggregationInterval: range.aggregationInterval,
  };
};

/**
 * Calculates the next date range by sliding the window forward
 * 
 * Enables forward navigation through custom date ranges. When users click "Next",
 * this function slides the time window forward by the same duration. However, it prevents
 * navigating beyond the current time (maxEndTime) since future data doesn't exist.
 * 
 * Used by date range navigation controls. Returns null when next range would exceed current time,
 * which disables the "Next" button in the UI.
 * 
 * @param range - Current date range object with start, end, and aggregationInterval
 * @param maxEndTime - Maximum allowed end time in milliseconds (defaults to current time)
 * @returns Next date range with same duration, shifted forward in time, or null if exceeds maxEndTime
 */
export const calculateNextDateRange = (
  range: DateRange,
  maxEndTime: number = Date.now()
): DateRange | null => {
  let rangeDuration = range.end - range.start;
  
  // Clamp duration to 350 days - 1 second if year interval is not selected
  const MAX_DURATION_DAYS = 350;
  const MAX_DURATION_MS = MAX_DURATION_DAYS * MS.DAY - MS.SECOND;
  if (rangeDuration > MAX_DURATION_MS && range.aggregationInterval !== "year") {
    rangeDuration = MAX_DURATION_MS;
  }
  
  const newEnd = range.end + rangeDuration;

  if (newEnd <= maxEndTime) {
    return {
      start: range.start + rangeDuration,
      end: newEnd,
      aggregationInterval: range.aggregationInterval,
    };
  }

  return null;
};

/**
 * Checks if navigation to next period is possible
 * 
 * UI needs to know when to enable/disable the "Next" navigation button. This function
 * determines if forward navigation is possible:
 * - For custom date ranges: Check if next range would exceed current time
 * - For period-based navigation: Check if timeOffset > 0 (can go forward from past to present)
 * 
 * Used by chart navigation controls to conditionally enable/disable the "Next" button,
 * preventing users from trying to navigate to future data that doesn't exist.
 * 
 * @param customDateRange - Custom date range object if active, null if using period-based navigation
 * @param timeOffset - Time offset for period-based navigation (0 = current, 1 = previous, etc.)
 * @param maxEndTime - Maximum allowed end time in milliseconds (defaults to current time)
 * @returns True if next navigation is possible, false otherwise
 */
export const canNavigateToNext = (
  customDateRange: { start: number; end: number } | null,
  timeOffset: number,
  maxEndTime: number = Date.now()
): boolean => {
  if (customDateRange) {
    const rangeDuration = customDateRange.end - customDateRange.start;
    const nextEnd = customDateRange.end + rangeDuration;
    return nextEnd <= maxEndTime;
  }
  return timeOffset > 0;
};

/**
 * Determines aggregation interval based on date range duration
 * 
 * When users select custom date ranges, we need to determine the appropriate aggregation
 * interval based on the duration. This ensures efficient data retrieval and proper chart display:
 * - Raw aggregation: Always uses "day" interval (31 day limit)
 * - 1-31 days: Uses "day" interval (hourly or daily aggregation)
 * - 31-350 days: Uses "month" interval (monthly aggregation)
 * - 350+ days: Uses "year" interval (yearly aggregation)
 * 
 * This function is used when users select custom date ranges to automatically determine the
 * best aggregation interval for the selected duration.
 * 
 * @param durationMs - Duration of the date range in milliseconds
 * @param aggregation - Optional aggregation method ("raw", "avg", "min", "max", etc.)
 * @returns Aggregation interval type ("day", "month", or "year")
 */
export const determineIntervalFromDuration = (
  durationMs: number,
  aggregation?: string
): "day" | "month" | "year" => {
  // Raw aggregation always uses day interval (31 day limit)
  if (aggregation === "raw") {
    return "day";
  }

  const DAY_LIMIT = 31 * MS.DAY; // 31 days
  const MONTH_LIMIT = 350 * MS.DAY; // 350 days

  if (durationMs <= DAY_LIMIT) {
    return "day";
  } else if (durationMs <= MONTH_LIMIT) {
    return "month";
  } else {
    return "year";
  }
};

/**
 * Calculates inner padding for bar charts based on the number of visible data points.
 * 
 * Bar charts need different spacing between bars depending on how many bars are visible.
 * More bars require tighter spacing (higher innerPadding) to prevent overlap, while fewer bars
 * can use looser spacing (lower innerPadding) for better visual separation.
 * 
 * Used by chart components to dynamically adjust bar spacing for optimal visual appearance.
 * 
 * @param numVisiblePoints - Number of visible data points in the chart
 * @returns Inner padding value (0.6 to 0.8) for bar chart spacing
 */
export const calculateBarChartInnerPadding = (numVisiblePoints: number): number => {
  if (numVisiblePoints >= 24) {
    return 0.8;
  } else if (numVisiblePoints >= 12) {
    return 0.75;
  } else if (numVisiblePoints >= 7) {
    return 0.7;
  } else {
    return 0.6;
  }
};
