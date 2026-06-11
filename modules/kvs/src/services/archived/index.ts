/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Archived-media service public face: fragments, thumbnails, and HLS.
 * Import from this module (or `@modules/kvs`) — not from internal files.
 */

export { KvsArchivedMediaService } from "./service";
export type {
  KvsTimeRange,
  ListFragmentsOptions,
  GetThumbnailsOptions,
  GetHlsUrlOptions,
  KvsFragment,
  KvsThumbnail,
} from "./types";
