/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  KinesisVideoClient,
  GetDataEndpointCommand,
  type APIName,
} from "@aws-sdk/client-kinesis-video";
import { KinesisVideoArchivedMediaClient } from "@aws-sdk/client-kinesis-video-archived-media";
import type { AwsCredentials } from "../../types";
import { DATA_ENDPOINT_TTL_MS } from "./constants";

interface DataEndpointEntry {
  endpoint: string;
  expiresAt: number;
}

/** Process-local cache of GetDataEndpoint results (keyed by region|stream|api). */
const dataEndpointCache = new Map<string, DataEndpointEntry>();

/**
 * Builds a cache key for a data-endpoint lookup.
 * @param region - AWS region.
 * @param streamName - KVS stream name.
 * @param apiName - Data-endpoint API family.
 * @returns Stable cache key string.
 */
function endpointCacheKey(
  region: string,
  streamName: string,
  apiName: string,
): string {
  return `${region}|${streamName}|${apiName}`;
}

/**
 * Builds an archived-media client bound to the correct data endpoint for a
 * given API family (KVS requires a per-API data endpoint). Endpoints are
 * cached for {@link DATA_ENDPOINT_TTL_MS}; failed lookups clear the entry.
 * @param region - AWS region.
 * @param credentials - Temporary AWS credentials.
 * @param streamName - Target KVS stream name.
 * @param apiName - Data-endpoint API family.
 * @returns An archived-media client pointed at the resolved endpoint.
 */
export async function createArchivedMediaClient(
  region: string,
  credentials: AwsCredentials,
  streamName: string,
  apiName: APIName,
): Promise<KinesisVideoArchivedMediaClient> {
  const key = endpointCacheKey(region, streamName, apiName);
  const cached = dataEndpointCache.get(key);
  let dataEndpoint: string | undefined =
    cached && Date.now() < cached.expiresAt ? cached.endpoint : undefined;

  if (!dataEndpoint) {
    try {
      const control = new KinesisVideoClient({ region, credentials });
      const { DataEndpoint } = await control.send(
        new GetDataEndpointCommand({ StreamName: streamName, APIName: apiName }),
      );
      if (!DataEndpoint) {
        dataEndpointCache.delete(key);
        throw new Error(
          `GetDataEndpoint returned no endpoint for ${apiName} on ${streamName}`,
        );
      }
      dataEndpoint = DataEndpoint;
      dataEndpointCache.set(key, {
        endpoint: dataEndpoint,
        expiresAt: Date.now() + DATA_ENDPOINT_TTL_MS,
      });
    } catch (err) {
      dataEndpointCache.delete(key);
      throw err;
    }
  }

  return new KinesisVideoArchivedMediaClient({
    region,
    credentials,
    endpoint: dataEndpoint,
  });
}
