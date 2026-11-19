/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BRAND_FETCH_RETRY_MS,
  BRAND_JSON_MAX_BYTES,
  BRAND_NOT_PUBLISHED_STATUSES,
  CONFIG_FETCH_TIMEOUT_MS,
} from "@shared/utils/constants";
import { parseUrlStyle, type StyleDocument } from "./schema";

const ABORT_ERROR = "AbortError";
const LOG_PREFIX = "[RuntimeStyle]";

/** Outcome of fetching a deployment brand for URL `brand` / web apply paths. */
export interface BrandDocumentFetchOutcome {
  document: StyleDocument | null;
  unreadable: boolean;
}

/**
 * Checks whether a fetch failed because the timeout AbortController fired.
 * Callers do not pass an external signal for brand.json, so abort means timeout.
 * @param error - Caught fetch failure
 * @returns Whether the request was aborted
 */
function isTimeoutAbort(error: unknown): boolean {
  return error instanceof Error && error.name === ABORT_ERROR;
}

/**
 * Single brand.json GET with timeout and size cap.
 * @param brandUrl - Deployment brand.json URL
 * @param timeoutMs - Abort deadline
 * @returns Body text, or null when the deployment has not published a style (403/404)
 */
async function fetchPublishedBrandTextOnce(
  brandUrl: string,
  timeoutMs: number,
): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(brandUrl, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (BRAND_NOT_PUBLISHED_STATUSES.includes(res.status)) return null;
    if (!res.ok) throw new Error(`Brand fetch failed: HTTP ${res.status}`);

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > BRAND_JSON_MAX_BYTES) {
      throw new Error("Brand JSON is too large");
    }
    return new TextDecoder().decode(bytes);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Downloads published brand.json with timeout, 32 KB cap, and one retry on
 * network failure (timeouts are not retried). HTTP 403/404 means “not published”.
 * Platform stores validate and persist the returned text themselves.
 * @param brandUrl - Deployment brand.json URL
 * @returns Body text, or null when none is published
 */
export async function fetchPublishedBrandText(
  brandUrl: string,
): Promise<string | null> {
  const timeoutMs = CONFIG_FETCH_TIMEOUT_MS;
  try {
    return await fetchPublishedBrandTextOnce(brandUrl, timeoutMs);
  } catch (error) {
    if (isTimeoutAbort(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, BRAND_FETCH_RETRY_MS));
    return fetchPublishedBrandTextOnce(brandUrl, timeoutMs);
  }
}

/**
 * Fetches brand.json and validates it with URL-style rules (allows data: images).
 * Used by web scan / sync; native scan skips this path via Platform checks.
 * @param brandUrl - HTTPS URL of the deployment brand.json
 * @returns Document when valid, or unreadable when fetch/validation fails
 */
export async function fetchBrandDocumentForUrl(
  brandUrl: string,
): Promise<BrandDocumentFetchOutcome> {
  try {
    const text = await fetchPublishedBrandText(brandUrl);
    if (!text) return { document: null, unreadable: false };
    const value: unknown = JSON.parse(text);
    const { style, error } = parseUrlStyle(value);
    if (!style) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} Brand URL validation failed:`, error);
      }
      return { document: null, unreadable: true };
    }
    return { document: style, unreadable: false };
  } catch (error) {
    if (__DEV__) {
      console.warn(`${LOG_PREFIX} Brand fetch failed:`, error);
    }
    return { document: null, unreadable: true };
  }
}
