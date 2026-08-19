/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  KinesisVideoClient,
  DescribeSignalingChannelCommand,
  GetSignalingChannelEndpointCommand,
} from "@aws-sdk/client-kinesis-video";
import {
  KinesisVideoSignalingClient,
  GetIceServerConfigCommand,
} from "@aws-sdk/client-kinesis-video-signaling";

import { KvsSignalingClient } from "./transport";
import { ChannelCache } from "./channelCache";
import {
  SIGNALING_CHANNEL_ROLE_VIEWER,
  SIGNALING_PROTOCOL_WSS,
  SIGNALING_PROTOCOL_HTTPS,
  ICE_SERVERS_TTL_SKEW_SECONDS,
  ERROR_CHANNEL_ARN_MISSING,
  ERROR_SIGNALING_ENDPOINTS_MISSING,
  SIGV4_SERVICE_KINESISVIDEO,
} from "./constants";
import type { AwsCredentials } from "../../types";
import type {
  CachedChannelInfo,
  CreateViewerClientOptions,
  IceServer,
  IceServersFetchResult,
} from "./types";

/**
 * Signaling service: discover channel endpoints, fetch ICE servers (cached),
 * and construct viewer WebSocket clients. Bound to parent {@link KvsClient}
 * credentials/region. Cache is instance-scoped (not process-global).
 */
export class KvsSignalingService {
  private readonly cache = new ChannelCache();

  /**
   * @param region - AWS region from the parent client.
   * @param credentials - AWS credentials from the parent client.
   */
  constructor(
    private readonly region: string,
    private credentials: AwsCredentials,
  ) {}

  /**
   * Replaces bound credentials and drops cached ICE servers (TURN creds are
   * tied to the prior session). Channel ARN/endpoints are kept.
   * @param credentials - Fresh temporary AWS credentials.
   */
  updateCredentials(credentials: AwsCredentials): void {
    this.credentials = credentials;
    this.cache.clearIceServers();
  }

  /**
   * Describes the signaling channel and resolves WSS/HTTPS viewer endpoints.
   * Results are cached (~24 h) with in-flight deduplication.
   * @param channelName - KVS signaling channel name.
   * @returns Channel ARN plus WSS and HTTPS endpoints.
   */
  async discoverChannel(channelName: string): Promise<CachedChannelInfo> {
    return this.cache.getOrFetchChannelInfo(channelName, async () => {
      const kinesisVideoClient = new KinesisVideoClient({
        region: this.region,
        credentials: this.credentials,
      });

      const describeResponse = await kinesisVideoClient.send(
        new DescribeSignalingChannelCommand({ ChannelName: channelName }),
      );
      const channelARN = describeResponse.ChannelInfo?.ChannelARN;
      if (!channelARN) {
        throw new Error(ERROR_CHANNEL_ARN_MISSING);
      }

      const endpointResponse = await kinesisVideoClient.send(
        new GetSignalingChannelEndpointCommand({
          ChannelARN: channelARN,
          SingleMasterChannelEndpointConfiguration: {
            Protocols: [SIGNALING_PROTOCOL_WSS, SIGNALING_PROTOCOL_HTTPS],
            Role: SIGNALING_CHANNEL_ROLE_VIEWER,
          },
        }),
      );

      const endpointsByProtocol =
        endpointResponse.ResourceEndpointList?.reduce(
          (endpoints, endpoint) => {
            if (endpoint.Protocol && endpoint.ResourceEndpoint) {
              endpoints[endpoint.Protocol] = endpoint.ResourceEndpoint;
            }
            return endpoints;
          },
          {} as Record<string, string>,
        );

      const wssEndpoint = endpointsByProtocol?.[SIGNALING_PROTOCOL_WSS];
      const httpsEndpoint = endpointsByProtocol?.[SIGNALING_PROTOCOL_HTTPS];

      if (!wssEndpoint || !httpsEndpoint) {
        throw new Error(ERROR_SIGNALING_ENDPOINTS_MISSING);
      }

      return { channelARN, wssEndpoint, httpsEndpoint };
    });
  }

  /**
   * Fetches TURN/STUN ICE servers for the channel (cached; TTL derived from
   * the AWS response when present).
   * @param channelName - Channel name used as the cache key.
   * @param channelARN - Signaling channel ARN.
   * @param httpsEndpoint - HTTPS signaling endpoint from discovery.
   * @returns ICE server list for RTCPeerConnection.
   */
  async getIceServers(
    channelName: string,
    channelARN: string,
    httpsEndpoint: string,
  ): Promise<IceServer[]> {
    return this.cache.getOrFetchIceServers(
      channelName,
      async (): Promise<IceServersFetchResult> => {
        const signalingClient = new KinesisVideoSignalingClient({
          region: this.region,
          credentials: this.credentials,
          endpoint: httpsEndpoint,
        });

        const response = await signalingClient.send(
          new GetIceServerConfigCommand({ ChannelARN: channelARN }),
        );

        const servers: IceServer[] =
          response.IceServerList?.map((iceServer) => ({
            urls: iceServer.Uris || [],
            username: iceServer.Username,
            credential: iceServer.Password,
          })) || [];

        servers.push({
          urls: [
            `stun:stun.${SIGV4_SERVICE_KINESISVIDEO}.${this.region}.amazonaws.com:443`,
          ],
        });

        const responseTtl = response.IceServerList?.[0]?.Ttl;
        const ttlMs = responseTtl
          ? (responseTtl - ICE_SERVERS_TTL_SKEW_SECONDS) * 1000
          : undefined;

        return { servers, ttlMs };
      },
    );
  }

  /**
   * Creates a viewer WebSocket signaling client using bound region/credentials.
   * @param options - Channel ARN, WSS endpoint, and viewer client id.
   * @returns A {@link KvsSignalingClient} ready for `open()`.
   */
  createViewerClient(options: CreateViewerClientOptions): KvsSignalingClient {
    return new KvsSignalingClient({
      channelARN: options.channelARN,
      channelEndpoint: options.channelEndpoint,
      clientId: options.clientId,
      region: this.region,
      credentials: this.credentials,
    });
  }

  /**
   * Drops cached channel info and ICE servers for a channel (e.g. after errors).
   * @param channelName - Signaling channel name whose cache to clear.
   */
  clearCache(channelName: string): void {
    this.cache.clearChannel(channelName);
  }
}
