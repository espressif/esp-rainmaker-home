/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure helpers for KVS recordings (stream naming, thumbnail sampling, creds).
 * No React state, hooks, or network I/O.
 */

import type { AwsCredentials, KvsThumbnail } from "@modules/kvs";
import type { RecordingThumb } from "../types";
import {
  KVS_STREAM_NAME_PREFIX,
  RECORDINGS_THUMBNAIL_MAX,
  RECORDINGS_MIN_THUMBNAIL_SAMPLING_MS,
  RECORDINGS_ERROR_MISSING_AWS_CREDS,
} from "./constants";

/** Shape of temporary AWS keys returned by CDF `assumeRole`. */
export interface AssumeRoleCredsLike {
  accessKey?: string;
  secretKey?: string;
  sessionToken?: string;
}

/**
 * Resolves the KVS stream name: explicit override when non-empty, otherwise
 * the firmware convention `rm-<nodeId>`.
 * @param nodeId - Camera node id.
 * @param explicitStreamName - Optional advertised stream name override.
 * @returns Stream name to query.
 */
export function resolveKvsStreamName(
  nodeId: string,
  explicitStreamName?: string,
): string {
  const trimmed = explicitStreamName?.trim();
  if (trimmed && trimmed.length > 0) {
    return trimmed;
  }
  return `${KVS_STREAM_NAME_PREFIX}${nodeId}`;
}

/**
 * Spreads thumbnail samples across the full look-back window so
 * `RECORDINGS_THUMBNAIL_MAX` frames represent the whole range instead of
 * clustering near the start at a fixed interval.
 * @param lookbackMs - Query window length in ms.
 * @returns Sampling interval in ms (at least the configured floor).
 */
export function computeThumbnailSamplingMs(lookbackMs: number): number {
  return Math.max(
    RECORDINGS_MIN_THUMBNAIL_SAMPLING_MS,
    Math.floor(lookbackMs / RECORDINGS_THUMBNAIL_MAX),
  );
}

/**
 * Maps CDF `assumeRole` fields onto the AWS SDK credential shape.
 * @param creds - Temporary keys from `assumeRole`.
 * @returns Credentials for KVS archived-media clients.
 * @throws When any required key is missing.
 */
export function toAwsCredentials(creds: AssumeRoleCredsLike | null | undefined): AwsCredentials {
  if (!creds?.accessKey || !creds?.secretKey || !creds?.sessionToken) {
    throw new Error(RECORDINGS_ERROR_MISSING_AWS_CREDS);
  }
  return {
    accessKeyId: creds.accessKey,
    secretAccessKey: creds.secretKey,
    sessionToken: creds.sessionToken,
  };
}

/**
 * Maps KVS thumbnail payloads into the gallery `RecordingThumb` model.
 * @param thumbs - Raw thumbnails from `getThumbnails`.
 * @returns UI-facing thumbnail list.
 */
export function toRecordingThumbs(thumbs: KvsThumbnail[]): RecordingThumb[] {
  return thumbs.map((t) => ({
    timestampMs: t.timestampMs,
    base64Jpeg: t.base64Jpeg,
  }));
}
