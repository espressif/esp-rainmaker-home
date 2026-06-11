/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** KVS data-endpoint API names (GetDataEndpoint). */
export const API_LIST_FRAGMENTS = "LIST_FRAGMENTS";
export const API_GET_IMAGES = "GET_IMAGES";
export const API_GET_HLS = "GET_HLS_STREAMING_SESSION_URL";

/** Fragment / image selector type. */
export const SELECTOR_PRODUCER_TIMESTAMP = "PRODUCER_TIMESTAMP";

/** GetImages output format. */
export const IMAGE_FORMAT_JPEG = "JPEG";

/** HLS playback mode for archived ranges. */
export const HLS_PLAYBACK_ON_DEMAND = "ON_DEMAND";

/** HLS container format. */
export const HLS_CONTAINER_FRAGMENTED_MP4 = "FRAGMENTED_MP4";

/** Default HLS session URL lifetime (seconds). */
export const HLS_URL_EXPIRES_SECONDS = 300;

/** AWS minimum sampling interval for GetImages (ms). */
export const MIN_IMAGE_SAMPLING_INTERVAL_MS = 200;

/** Default ListFragments page size. */
export const DEFAULT_LIST_FRAGMENTS_MAX_RESULTS = 1000;

/** Max ListFragments pages per call (safety cap). */
export const MAX_LIST_FRAGMENTS_PAGES = 10;

/** Max fragments collected per listFragments call (safety cap). */
export const MAX_LIST_FRAGMENTS_TOTAL = 10_000;

/** Default GetImages max results. */
export const DEFAULT_THUMBNAIL_MAX_RESULTS = 100;

/** Default GetImages sampling interval (ms). */
export const DEFAULT_THUMBNAIL_SAMPLING_INTERVAL_MS = 1000;

/** Cached GetDataEndpoint TTL (channel data endpoints are stable). */
export const DATA_ENDPOINT_TTL_MS = 24 * 60 * 60 * 1000;

/** Error when GetHLSStreamingSessionURL returns no URL. */
export const ERROR_HLS_URL_MISSING =
  "KVS did not return an HLS streaming session URL";

/** Error when startMs is not strictly less than endMs. */
export const ERROR_INVALID_TIME_RANGE =
  "startMs must be less than endMs for archived-media queries";
