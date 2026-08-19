/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect, useRef } from "react";

// Hooks
import { useCDF } from "@shared/hooks/useCDF";

// Utils
import {
  mapCdfFileToGalleryFile,
  pickDownloadUrl,
  sortGalleryFilesByNewest,
  applyGalleryFilter,
  type CdfFileEntity,
  type CdfFileListResult,
  type GalleryFile,
} from "../utils/galleryFileUtils";

// Constants
import {
  GALLERY_FILE_ENTITY_TYPE_NODE,
  GALLERY_FILE_DEFAULT_RESULT_COUNT,
  GALLERY_FILTER_ALL,
  GALLERY_URL_CACHE_TTL_MS,
} from "../utils/constants";

// Types
import type { GalleryFilter, UseGalleryReturn } from "../types";

/**
 * Module-level cache of resolved presigned URLs keyed by `fileId`. Presigned
 * URLs regenerate (new signature) on every fetch, which busts React Native's
 * URI-keyed image cache and forces a re-download. Reusing the same URL across
 * gallery re-opens lets the native image cache hit and avoids re-resolving.
 */
const urlCache = new Map<string, { url: string; ts: number }>();

const LOG_PREFIX = "[useGallery]";

/**
 * Loads the media files (snapshots / clips) a node captured via CDF file APIs
 * (`getFiles` / `getFileById`), exposing them for the gallery grid with an
 * image/video filter. Delete uses the SDK file entity's `.delete()` returned
 * through CDF's generic `T`.
 * @param nodeId - Node whose files to list.
 * @returns Files, current filter + setter, loading/error, and a refresh action.
 */
export const useGallery = (nodeId: string): UseGalleryReturn => {
  const { espCDFUser } = useCDF();
  const [files, setFiles] = useState<GalleryFile[]>([]);
  const [filter, setFilter] = useState<GalleryFilter>(GALLERY_FILTER_ALL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async (): Promise<void> => {
    if (!espCDFUser) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} abort: no CDF user`, { nodeId });
      }
      setError("User not authenticated");
      return;
    }
    setLoading(true);
    setError(null);
    if (__DEV__) {
      console.log(`${LOG_PREFIX} list files`, { nodeId });
    }
    try {
      // CDF types `T` as both params and return; cast the SDK paginated result.
      const listed = (await espCDFUser.getFiles({
        entityType: GALLERY_FILE_ENTITY_TYPE_NODE,
        entityId: nodeId,
        resultCount: GALLERY_FILE_DEFAULT_RESULT_COUNT,
      })) as unknown as CdfFileListResult;
      const entities = Array.isArray(listed?.files) ? listed.files : [];
      const mapped = sortGalleryFilesByNewest(
        entities.filter((f) => Boolean(f?.fileId)).map(mapCdfFileToGalleryFile),
      );

      // Resolve missing presigned URLs once per file, then reuse from the cache
      // so re-opening the gallery does not re-fetch URLs or re-download images.
      const now = Date.now();
      const withUrls = await Promise.all(
        mapped.map(async (f) => {
          if (f.url) {
            urlCache.set(f.fileId, { url: f.url, ts: now });
            return f;
          }
          const cached = urlCache.get(f.fileId);
          if (cached && now - cached.ts < GALLERY_URL_CACHE_TTL_MS) {
            return { ...f, url: cached.url };
          }
          try {
            const resolved = await espCDFUser.getFileById<CdfFileEntity | null>(
              f.fileId,
            );
            const url = resolved ? pickDownloadUrl(resolved) : undefined;
            if (url) {
              urlCache.set(f.fileId, { url, ts: now });
              return { ...f, url };
            }
            return f;
          } catch {
            return f;
          }
        }),
      );
      if (mountedRef.current) setFiles(withUrls);
      if (__DEV__) {
        console.log(`${LOG_PREFIX} files loaded`, {
          nodeId,
          count: withUrls.length,
        });
      }
    } catch (err) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} list failed`, { nodeId, err });
      }
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load media");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [espCDFUser, nodeId]);

  const deleteFile = useCallback(
    async (fileId: string): Promise<void> => {
      if (!espCDFUser) {
        throw new Error("User not authenticated");
      }
      const file = await espCDFUser.getFileById<CdfFileEntity | null>(fileId);
      if (!file?.delete) {
        throw new Error("File not found or delete is unavailable");
      }
      await file.delete();
      urlCache.delete(fileId);
      if (mountedRef.current) {
        setFiles((prev) => prev.filter((f) => f.fileId !== fileId));
      }
      if (__DEV__) {
        console.log(`${LOG_PREFIX} file deleted`, { nodeId, fileId });
      }
    },
    [espCDFUser, nodeId],
  );

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  return {
    files,
    filtered: applyGalleryFilter(files, filter),
    filter,
    setFilter,
    loading,
    error,
    refresh,
    deleteFile,
  };
};
