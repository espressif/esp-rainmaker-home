/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extract JSON data from Python-style strings
 * Converts Python-style JSON (single quotes, True/False/None) to valid JSON
 */
export const extractJsonData = (rawStr: string): any => {
  try {
    // Split on the first colon and get the part after it
    const parts = rawStr.split(/:(.+)/);
    if (parts.length < 2) {
      return null;
    }
    const jsonLike = parts[1];

    // Replace Python-style quotes and booleans with valid JSON equivalents
    const fixedJson = jsonLike
      .replace(/'/g, '"') // replace single quotes with double quotes
      .replace(/\bFalse\b/g, "false") // replace Python False with false
      .replace(/\bTrue\b/g, "true") // replace Python True with true
      .replace(/\bNone\b/g, "null") // replace Python None with null
      .trim();

    // Parse the cleaned JSON string
    const data = JSON.parse(fixedJson);
    return data;
  } catch (err) {
    return null;
  }
};

/**
 * Safely parse a timestamp value into a Date object
 * Handles various formats: number (Unix timestamp), string (ISO or Unix), Date object
 */
export const parseTimestamp = (timestamp: any): Date => {
  if (!timestamp) {
    return new Date();
  }

  // If it's already a Date object, validate it
  if (timestamp instanceof Date) {
    return isNaN(timestamp.getTime()) ? new Date() : timestamp;
  }

  // If it's a number, treat as Unix timestamp (milliseconds)
  if (typeof timestamp === 'number') {
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? new Date() : date;
  }

  // If it's a string, try to parse it
  if (typeof timestamp === 'string') {
    // Try parsing as number first (Unix timestamp)
    const numTimestamp = Number(timestamp);
    if (!isNaN(numTimestamp)) {
      const date = new Date(numTimestamp);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    
    // Try parsing as ISO string
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Fallback to current date if all parsing fails
  return new Date();
};

/**
 * Safely format a timestamp for display
 */
export const formatTimestamp = (timestamp: Date): string => {
  try {
    if (!timestamp || !(timestamp instanceof Date) || isNaN(timestamp.getTime())) {
      return new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    
    return timestamp.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    return new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
};

