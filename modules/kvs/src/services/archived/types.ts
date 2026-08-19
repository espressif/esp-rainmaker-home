/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** Producer-timestamp range for archived-media queries. */
export interface KvsTimeRange {
  /** Range start (epoch ms). */
  startMs: number;
  /** Range end (epoch ms). */
  endMs: number;
}

/** Options for listing recorded fragments. */
export interface ListFragmentsOptions extends KvsTimeRange {
  /** KVS stream name to query. */
  streamName: string;
  /** Page size per ListFragments call (default 1000). Hard caps also limit total pages/fragments. */
  maxResults?: number;
}

/** Options for sampling JPEG thumbnails from the archive. */
export interface GetThumbnailsOptions extends KvsTimeRange {
  /** KVS stream name to query. */
  streamName: string;
  /** Sampling interval in ms (clamped to >= 200). Default 1000. */
  samplingIntervalMs?: number;
  /** Max images to return (default 100). */
  maxResults?: number;
  /** Optional output width in pixels. */
  width?: number;
  /** Optional output height in pixels. */
  height?: number;
}

/** Options for resolving an on-demand HLS session URL. */
export interface GetHlsUrlOptions extends KvsTimeRange {
  /** KVS stream name to query. */
  streamName: string;
  /** Session URL lifetime in seconds (default 300). */
  expiresSeconds?: number;
}

/** A single recorded fragment (clip) in the KVS archive. */
export interface KvsFragment {
  fragmentNumber: string;
  producerTimestampMs: number;
  durationMs: number;
  sizeBytes: number;
}

/** A thumbnail image extracted from the archive. */
export interface KvsThumbnail {
  timestampMs: number;
  /** Base64-encoded JPEG (no data-URI prefix). */
  base64Jpeg: string;
}
