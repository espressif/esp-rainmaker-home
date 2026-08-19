/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect, useRef } from "react";

// Hooks
import { useCDF } from "@shared/hooks/useCDF";

// Shared camera utils
import { getAwsRegionFromToken } from "@shared/utils/camera/getAwsRegion";

// Local KVS module
import {
  createKvsClient,
  type KvsFragment,
} from "@modules/kvs";

// Domain utils
import {
  resolveKvsStreamName,
  computeThumbnailSamplingMs,
  toAwsCredentials,
  toRecordingThumbs,
} from "../utils/recordingsHelpers";

// Constants
import {
  ASSUME_ROLE_VIDEOSTREAM,
  RECORDINGS_DEFAULT_LOOKBACK_MS,
  RECORDINGS_THUMBNAIL_MAX,
  RECORDINGS_ERROR_UNAUTHENTICATED,
  RECORDINGS_ERROR_LOAD_FAILED,
} from "../utils/constants";

// Types
import type { RecordingThumb, UseRecordingsReturn } from "../types";

/**
 * Loads recorded clips for a camera from KVS archived media: lists fragments in
 * the look-back window and pulls sampled JPEG thumbnails for the gallery's
 * Videos tab. Credentials come from `assumeRole('videostream')`, region from
 * the JWT. The KVS stream name defaults to `rm-<nodeId>` (the firmware
 * convention) unless an explicit stream name is supplied.
 * @param nodeId - Node whose recordings to load.
 * @param explicitStreamName - Optional advertised stream name override.
 * @param lookbackMs - Time window to query (default 24h).
 * @returns Fragments, thumbnails, the resolved stream name, loading/error, refresh.
 */
export const useRecordings = (
  nodeId: string,
  explicitStreamName?: string,
  lookbackMs: number = RECORDINGS_DEFAULT_LOOKBACK_MS,
): UseRecordingsReturn => {
  const { espCDFUser } = useCDF();
  const [fragments, setFragments] = useState<KvsFragment[]>([]);
  const [thumbnails, setThumbnails] = useState<RecordingThumb[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  const streamName = resolveKvsStreamName(nodeId, explicitStreamName);

  const refresh = useCallback(async (): Promise<void> => {
    if (!espCDFUser) {
      setError(RECORDINGS_ERROR_UNAUTHENTICATED);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const [creds, region] = await Promise.all([
        espCDFUser.assumeRole({
          userRole: ASSUME_ROLE_VIDEOSTREAM,
          nodeIds: [nodeId],
        }),
        getAwsRegionFromToken(),
      ]);

      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      const awsCredentials = toAwsCredentials(creds);
      const endMs = Date.now();
      const startMs = endMs - lookbackMs;
      const kvs = createKvsClient({
        region,
        credentials: awsCredentials,
      });

      const frags = await kvs.archived.listFragments({
        streamName,
        startMs,
        endMs,
      });

      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      setFragments(frags);

      if (frags.length === 0) {
        setThumbnails([]);
        return;
      }

      const thumbs = await kvs.archived.getThumbnails({
        streamName,
        startMs,
        endMs,
        samplingIntervalMs: computeThumbnailSamplingMs(lookbackMs),
        maxResults: RECORDINGS_THUMBNAIL_MAX,
      });

      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      setThumbnails(toRecordingThumbs(thumbs));
    } catch (err) {
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : RECORDINGS_ERROR_LOAD_FAILED);
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [espCDFUser, nodeId, streamName, lookbackMs]);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  return { fragments, thumbnails, streamName, loading, error, refresh };
};
