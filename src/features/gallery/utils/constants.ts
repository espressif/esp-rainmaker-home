/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** Gallery feature-private constants. */

// assumeRole user role granting temporary AWS creds for video/KVS access.
export const ASSUME_ROLE_VIDEOSTREAM = "videostream";

// Firmware convention for a camera's KVS recording stream name: `rm-<nodeId>`.
export const KVS_STREAM_NAME_PREFIX = "rm-";

// Storage source of a gallery item, shown as a bottom-right badge.
// `cloud` = RainMaker /user/file snapshots + KVS recordings; `device` = on the
// camera's SD card (list-files), surfaced once device-SD listing lands.
export const GALLERY_SOURCE_CLOUD = "cloud";
export const GALLERY_SOURCE_DEVICE = "device";
export type GallerySource = typeof GALLERY_SOURCE_CLOUD | typeof GALLERY_SOURCE_DEVICE;

// RainMaker file list filters (CDF getFiles params).
export const GALLERY_FILE_ENTITY_TYPE_NODE = "node";
export const GALLERY_FILE_DEFAULT_RESULT_COUNT = 100;

// Gallery media classification.
export const GALLERY_MEDIA_TYPE_IMAGE = "image";
export const GALLERY_MEDIA_TYPE_VIDEO = "video";
export const GALLERY_MEDIA_TYPE_OTHER = "other";
/** Grid filter that shows every media kind. */
export const GALLERY_FILTER_ALL = "all";
export const GALLERY_NAME_PREFIX_SNAPSHOT = "snapshot";
export const GALLERY_NAME_PREFIX_CLIP = "clip";
export const GALLERY_IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
] as const;
export const GALLERY_VIDEO_EXTENSIONS = [
  "mp4",
  "mkv",
  "webm",
  "mov",
  "m4v",
] as const;

/**
 * Presigned download URL cache TTL. Kept under the typical validity window so
 * React Native's URI-keyed image cache can hit across gallery re-opens.
 */
export const GALLERY_URL_CACHE_TTL_MS = 10 * 60 * 1000;

// KVS recordings look-back / thumbnail sampling (Videos tab).
/** Default look-back window for recordings (24h). */
export const RECORDINGS_DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** Max JPEG thumbnails sampled across the look-back window. */
export const RECORDINGS_THUMBNAIL_MAX = 60;
/** Floor for thumbnail sampling interval (ms). */
export const RECORDINGS_MIN_THUMBNAIL_SAMPLING_MS = 1000;

// Hook error messages (technical; UI can map later).
export const RECORDINGS_ERROR_UNAUTHENTICATED = "User not authenticated";
export const RECORDINGS_ERROR_MISSING_AWS_CREDS = "Missing AWS credentials";
export const RECORDINGS_ERROR_LOAD_FAILED = "Failed to load recordings";
