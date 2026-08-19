/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure gallery file helpers: normalize CDF/SDK file entities into the UI
 * `GalleryFile` model and classify media. No hooks, store, or network I/O.
 */

import {
  GALLERY_FILTER_ALL,
  GALLERY_MEDIA_TYPE_IMAGE,
  GALLERY_MEDIA_TYPE_VIDEO,
  GALLERY_MEDIA_TYPE_OTHER,
  GALLERY_NAME_PREFIX_SNAPSHOT,
  GALLERY_NAME_PREFIX_CLIP,
  GALLERY_IMAGE_EXTENSIONS,
  GALLERY_VIDEO_EXTENSIONS,
} from "./constants";

/** Classified media kind for a gallery item. */
export type GalleryMediaType =
  | typeof GALLERY_MEDIA_TYPE_IMAGE
  | typeof GALLERY_MEDIA_TYPE_VIDEO
  | typeof GALLERY_MEDIA_TYPE_OTHER;

/** A normalized gallery file record for the UI grid. */
export interface GalleryFile {
  fileId: string;
  name: string;
  contentType: string;
  mediaType: GalleryMediaType;
  /** Epoch milliseconds. */
  timestampMs: number;
  /** Presigned download URL when available. */
  url?: string;
}

/**
 * Structural fields read from a CDF `getFiles` / `getFileById` SDK entity (`T`).
 * Features must not import `@espressif/rainmaker-base-sdk`; this mirrors ESPFile.
 */
export interface CdfFileEntity {
  fileId: string;
  fileName?: string;
  fileType?: string;
  timestamp?: string;
  downloadUrl?: string;
  /** Optional SDK helper that returns the cached download URL. */
  getDownloadUrl?: () => string | undefined;
  /** Deletes this file from RainMaker storage. */
  delete?: () => Promise<void>;
}

/** Paginated result shape from CDF `getFiles` (SDK via `T`). */
export interface CdfFileListResult {
  files: CdfFileEntity[];
}

/**
 * Normalizes a timestamp value (epoch seconds or milliseconds) to epoch ms.
 * @param value - Raw timestamp (number or numeric string).
 * @returns Epoch milliseconds, or 0 if unparseable.
 */
export function parseTimestampMs(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Values below ~1e12 are seconds; scale up to milliseconds.
  return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
}

/**
 * Classifies a file as image/video/other by content type, then extension,
 * then name prefix (mirrors the native app + CLI heuristics).
 * @param contentType - MIME type string (may be empty).
 * @param name - File name.
 * @returns The classified media type.
 */
export function classifyMedia(contentType: string, name: string): GalleryMediaType {
  const mt = (contentType || "").toLowerCase();
  if (mt.startsWith("image/")) return GALLERY_MEDIA_TYPE_IMAGE;
  if (mt.startsWith("video/")) return GALLERY_MEDIA_TYPE_VIDEO;
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if ((GALLERY_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
    return GALLERY_MEDIA_TYPE_IMAGE;
  }
  if ((GALLERY_VIDEO_EXTENSIONS as readonly string[]).includes(ext)) {
    return GALLERY_MEDIA_TYPE_VIDEO;
  }
  const lower = name.toLowerCase();
  if (lower.startsWith(GALLERY_NAME_PREFIX_SNAPSHOT)) return GALLERY_MEDIA_TYPE_IMAGE;
  if (lower.startsWith(GALLERY_NAME_PREFIX_CLIP)) return GALLERY_MEDIA_TYPE_VIDEO;
  return GALLERY_MEDIA_TYPE_OTHER;
}

/**
 * Picks a download URL from a CDF/SDK file entity (`downloadUrl` or helper).
 * @param entity - Structural file fields from `getFiles` / `getFileById`.
 * @returns The download URL, or undefined when neither source is present.
 */
export function pickDownloadUrl(entity: CdfFileEntity): string | undefined {
  return entity.downloadUrl ?? entity.getDownloadUrl?.();
}

/**
 * Maps a CDF/SDK file entity into the gallery UI model.
 * @param entity - Structural file fields from `getFiles` / `getFileById`.
 * @returns Normalized {@link GalleryFile}.
 */
export function mapCdfFileToGalleryFile(entity: CdfFileEntity): GalleryFile {
  const name = entity.fileName ?? "";
  const contentType = entity.fileType ?? "";
  return {
    fileId: entity.fileId,
    name,
    contentType,
    mediaType: classifyMedia(contentType, name),
    timestampMs: parseTimestampMs(entity.timestamp),
    url: pickDownloadUrl(entity),
  };
}

/**
 * Sorts gallery files newest-first by `timestampMs`.
 * @param files - Files to sort (not mutated).
 * @returns A new array sorted descending by timestamp.
 */
export function sortGalleryFilesByNewest(files: GalleryFile[]): GalleryFile[] {
  return [...files].sort((a, b) => b.timestampMs - a.timestampMs);
}

/**
 * Applies the All / image / video filter to a gallery file list.
 * @param files - Full file list.
 * @param filter - Active grid filter.
 * @returns The filtered list (`files` when filter is All).
 */
export function applyGalleryFilter(
  files: GalleryFile[],
  filter:
    | typeof GALLERY_FILTER_ALL
    | typeof GALLERY_MEDIA_TYPE_IMAGE
    | typeof GALLERY_MEDIA_TYPE_VIDEO,
): GalleryFile[] {
  if (filter === GALLERY_FILTER_ALL) return files;
  return files.filter((f) => f.mediaType === filter);
}
