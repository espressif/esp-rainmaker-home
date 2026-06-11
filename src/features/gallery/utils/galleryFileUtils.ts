/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Re-export shared gallery file helpers for gallery-domain callers.
 * Canonical implementation: `@shared/utils/galleryFileUtils`.
 */
export {
  parseTimestampMs,
  classifyMedia,
  pickDownloadUrl,
  mapCdfFileToGalleryFile,
  sortGalleryFilesByNewest,
  applyGalleryFilter,
  type GalleryMediaType,
  type GalleryFile,
  type CdfFileEntity,
  type CdfFileListResult,
} from "@shared/utils/galleryFileUtils";
