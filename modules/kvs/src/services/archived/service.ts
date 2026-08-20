/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ListFragmentsCommand,
  GetImagesCommand,
  GetHLSStreamingSessionURLCommand,
} from "@aws-sdk/client-kinesis-video-archived-media";
import { createArchivedMediaClient } from "./endpoint";
import {
  API_LIST_FRAGMENTS,
  API_GET_IMAGES,
  API_GET_HLS,
  SELECTOR_PRODUCER_TIMESTAMP,
  IMAGE_FORMAT_JPEG,
  HLS_PLAYBACK_ON_DEMAND,
  HLS_CONTAINER_FRAGMENTED_MP4,
  HLS_URL_EXPIRES_SECONDS,
  MIN_IMAGE_SAMPLING_INTERVAL_MS,
  DEFAULT_LIST_FRAGMENTS_MAX_RESULTS,
  DEFAULT_THUMBNAIL_MAX_RESULTS,
  DEFAULT_THUMBNAIL_SAMPLING_INTERVAL_MS,
  MAX_LIST_FRAGMENTS_PAGES,
  MAX_LIST_FRAGMENTS_TOTAL,
  ERROR_HLS_URL_MISSING,
  ERROR_INVALID_TIME_RANGE,
} from "./constants";
import type { AwsCredentials } from "../../types";
import type {
  ListFragmentsOptions,
  GetThumbnailsOptions,
  GetHlsUrlOptions,
  KvsFragment,
  KvsThumbnail,
  KvsTimeRange,
} from "./types";

/**
 * Asserts that a producer-timestamp range is valid (startMs must be less than endMs).
 * @param range - Time range to validate.
 * @throws If the range is invalid.
 */
function assertValidTimeRange(range: KvsTimeRange): void {
  if (!(range.startMs < range.endMs)) {
    throw new Error(ERROR_INVALID_TIME_RANGE);
  }
}

/**
 * Archived-media service: list fragments, sample JPEG thumbnails, and resolve
 * on-demand HLS URLs. Bound to the parent {@link KvsClient} credentials/region.
 */
export class KvsArchivedMediaService {
  /**
   * @param region - AWS region from the parent client.
   * @param credentials - AWS credentials from the parent client.
   */
  constructor(
    private readonly region: string,
    private credentials: AwsCredentials,
  ) {}

  /**
   * Replaces bound credentials used for subsequent archived-media calls.
   * @param credentials - Fresh temporary AWS credentials.
   */
  updateCredentials(credentials: AwsCredentials): void {
    this.credentials = credentials;
  }

  /**
   * Lists recorded fragments within a producer-timestamp range, paginating
   * until all results are collected or safety caps are hit.
   * @param options - Stream, time range, and optional page size.
   * @returns Fragments sorted oldest-first by producer timestamp.
   */
  async listFragments(options: ListFragmentsOptions): Promise<KvsFragment[]> {
    assertValidTimeRange(options);
    const maxResults = options.maxResults ?? DEFAULT_LIST_FRAGMENTS_MAX_RESULTS;
    const client = await createArchivedMediaClient(
      this.region,
      this.credentials,
      options.streamName,
      API_LIST_FRAGMENTS,
    );
    const fragments: KvsFragment[] = [];
    let nextToken: string | undefined;
    let pages = 0;
    do {
      if (pages >= MAX_LIST_FRAGMENTS_PAGES) {
        break;
      }
      const res = await client.send(
        new ListFragmentsCommand({
          StreamName: options.streamName,
          MaxResults: maxResults,
          FragmentSelector: {
            FragmentSelectorType: SELECTOR_PRODUCER_TIMESTAMP,
            TimestampRange: {
              StartTimestamp: new Date(options.startMs),
              EndTimestamp: new Date(options.endMs),
            },
          },
          NextToken: nextToken,
        }),
      );
      pages += 1;
      for (const f of res.Fragments ?? []) {
        fragments.push({
          fragmentNumber: f.FragmentNumber ?? "",
          producerTimestampMs: f.ProducerTimestamp
            ? f.ProducerTimestamp.getTime()
            : 0,
          durationMs: f.FragmentLengthInMilliseconds ?? 0,
          sizeBytes: f.FragmentSizeInBytes ?? 0,
        });
        if (fragments.length >= MAX_LIST_FRAGMENTS_TOTAL) {
          fragments.sort(
            (a, b) => a.producerTimestampMs - b.producerTimestampMs,
          );
          return fragments;
        }
      }
      nextToken = res.NextToken;
    } while (nextToken);
    fragments.sort((a, b) => a.producerTimestampMs - b.producerTimestampMs);
    return fragments;
  }

  /**
   * Fetches JPEG thumbnails sampled across a producer-timestamp range,
   * paginating until `maxResults` are collected or AWS has no more pages.
   * @param options - Stream, time range, sampling, and optional dimensions.
   * @returns Thumbnails with their timestamps.
   */
  async getThumbnails(options: GetThumbnailsOptions): Promise<KvsThumbnail[]> {
    assertValidTimeRange(options);
    const samplingIntervalMs =
      options.samplingIntervalMs ?? DEFAULT_THUMBNAIL_SAMPLING_INTERVAL_MS;
    const maxResults = options.maxResults ?? DEFAULT_THUMBNAIL_MAX_RESULTS;
    const client = await createArchivedMediaClient(
      this.region,
      this.credentials,
      options.streamName,
      API_GET_IMAGES,
    );
    const out: KvsThumbnail[] = [];
    let nextToken: string | undefined;
    do {
      const pageSize = Math.min(maxResults - out.length, maxResults);
      if (pageSize <= 0) break;

      const res = await client.send(
        new GetImagesCommand({
          StreamName: options.streamName,
          ImageSelectorType: SELECTOR_PRODUCER_TIMESTAMP,
          StartTimestamp: new Date(options.startMs),
          EndTimestamp: new Date(options.endMs),
          SamplingInterval: Math.max(
            MIN_IMAGE_SAMPLING_INTERVAL_MS,
            Math.floor(samplingIntervalMs),
          ),
          Format: IMAGE_FORMAT_JPEG,
          MaxResults: pageSize,
          NextToken: nextToken,
          ...(options.width ? { WidthPixels: options.width } : {}),
          ...(options.height ? { HeightPixels: options.height } : {}),
        }),
      );
      for (const img of res.Images ?? []) {
        if (img.ImageContent) {
          out.push({
            timestampMs: img.TimeStamp ? img.TimeStamp.getTime() : 0,
            base64Jpeg: img.ImageContent,
          });
          if (out.length >= maxResults) {
            return out;
          }
        }
      }
      nextToken = res.NextToken;
    } while (nextToken);
    return out;
  }

  /**
   * Resolves an on-demand HLS streaming-session URL for a recorded range.
   * @param options - Stream, time range, and optional URL expiry.
   * @returns The HLS session URL.
   */
  async getHlsUrl(options: GetHlsUrlOptions): Promise<string> {
    assertValidTimeRange(options);
    const expires = options.expiresSeconds ?? HLS_URL_EXPIRES_SECONDS;
    const client = await createArchivedMediaClient(
      this.region,
      this.credentials,
      options.streamName,
      API_GET_HLS,
    );
    const res = await client.send(
      new GetHLSStreamingSessionURLCommand({
        StreamName: options.streamName,
        PlaybackMode: HLS_PLAYBACK_ON_DEMAND,
        ContainerFormat: HLS_CONTAINER_FRAGMENTED_MP4,
        HLSFragmentSelector: {
          FragmentSelectorType: SELECTOR_PRODUCER_TIMESTAMP,
          TimestampRange: {
            StartTimestamp: new Date(options.startMs),
            EndTimestamp: new Date(options.endMs),
          },
        },
        Expires: expires,
      }),
    );
    if (!res.HLSStreamingSessionURL) {
      throw new Error(ERROR_HLS_URL_MISSING);
    }
    return res.HLSStreamingSessionURL;
  }
}
