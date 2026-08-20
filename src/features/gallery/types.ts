/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GALLERY_FILTER_ALL,
  GALLERY_MEDIA_TYPE_IMAGE,
  GALLERY_MEDIA_TYPE_VIDEO,
} from "./utils/constants";
import type { GalleryFile } from "./utils/galleryFileUtils";
import type { KvsFragment } from "@modules/kvs";

/** Filter applied to the gallery grid. */
export type GalleryFilter =
  | typeof GALLERY_FILTER_ALL
  | typeof GALLERY_MEDIA_TYPE_IMAGE
  | typeof GALLERY_MEDIA_TYPE_VIDEO;

/** Return shape of `useGallery`. */
export interface UseGalleryReturn {
  files: GalleryFile[];
  filtered: GalleryFile[];
  filter: GalleryFilter;
  setFilter: (f: GalleryFilter) => void;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Deletes a file from RainMaker storage and removes it from the grid. */
  deleteFile: (fileId: string) => Promise<void>;
}

/** A recording thumbnail with its capture time. */
export interface RecordingThumb {
  timestampMs: number;
  base64Jpeg: string;
}

/** Return shape of `useRecordings`. */
export interface UseRecordingsReturn {
  fragments: KvsFragment[];
  thumbnails: RecordingThumb[];
  streamName: string;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}
