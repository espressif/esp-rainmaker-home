/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Per-client in-memory cache for KVS signaling channel info and ICE servers.
 *
 * Channel info (ARN + WSS/HTTPS endpoints) practically never changes for the
 * lifetime of a device, so it is cached for {@link CHANNEL_INFO_TTL_MS}.
 *
 * ICE credentials from GetIceServerConfig expire after ~300 s; they are cached
 * for {@link ICE_SERVERS_TTL_MS} (or a caller-supplied TTL) to avoid serving
 * near-expired credentials.
 *
 * Concurrent callers for the same channel share one in-flight Promise so
 * pre-warm and startStreaming racing on a fresh launch do not duplicate work.
 *
 * Owned by {@link KvsSignalingService} — one instance per {@link KvsClient}.
 */

import { CHANNEL_INFO_TTL_MS, ICE_SERVERS_TTL_MS } from "./constants";
import type {
  CachedChannelInfo,
  IceServer,
  IceServersFetchResult,
} from "./types";

interface ChannelInfoEntry {
  data: CachedChannelInfo;
  expiresAt: number;
}

interface IceServersEntry {
  data: IceServer[];
  expiresAt: number;
}

/**
 * Instance-scoped channel + ICE cache with TTL and in-flight deduplication.
 */
export class ChannelCache {
  private readonly channelInfoCache = new Map<string, ChannelInfoEntry>();
  private readonly iceServersCache = new Map<string, IceServersEntry>();
  private readonly channelInfoInFlight = new Map<
    string,
    Promise<CachedChannelInfo>
  >();
  private readonly iceServersInFlight = new Map<string, Promise<IceServer[]>>();

  /**
   * Returns cached channel info if still valid, otherwise null.
   * @param channelName - Signaling channel name used as the cache key.
   * @returns Cached info or null when missing/expired.
   */
  getCachedChannelInfo(channelName: string): CachedChannelInfo | null {
    const entry = this.channelInfoCache.get(channelName);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.channelInfoCache.delete(channelName);
      return null;
    }
    return entry.data;
  }

  /**
   * Stores channel info in the cache.
   * @param channelName - Signaling channel name used as the cache key.
   * @param info - ARN and endpoints to store.
   * @param customTtlMs - Optional TTL override (default 24 h).
   */
  setCachedChannelInfo(
    channelName: string,
    info: CachedChannelInfo,
    customTtlMs?: number,
  ): void {
    this.channelInfoCache.set(channelName, {
      data: info,
      expiresAt: Date.now() + (customTtlMs ?? CHANNEL_INFO_TTL_MS),
    });
  }

  /**
   * Returns cached channel info if available, otherwise calls `fetcher` once
   * even if multiple callers arrive simultaneously.
   * @param channelName - Signaling channel name used as the cache key.
   * @param fetcher - Network fetch that resolves channel ARN + endpoints.
   * @returns Channel info from cache or a single shared fetch.
   */
  getOrFetchChannelInfo(
    channelName: string,
    fetcher: () => Promise<CachedChannelInfo>,
  ): Promise<CachedChannelInfo> {
    const cached = this.getCachedChannelInfo(channelName);
    if (cached) return Promise.resolve(cached);

    const existing = this.channelInfoInFlight.get(channelName);
    if (existing) return existing;

    const promise = fetcher()
      .then((info) => {
        this.setCachedChannelInfo(channelName, info);
        this.channelInfoInFlight.delete(channelName);
        return info;
      })
      .catch((err: unknown) => {
        this.channelInfoInFlight.delete(channelName);
        throw err;
      });

    this.channelInfoInFlight.set(channelName, promise);
    return promise;
  }

  /**
   * Returns cached ICE servers if still valid, otherwise null.
   * @param channelName - Signaling channel name used as the cache key.
   * @returns Cached ICE servers or null when missing/expired.
   */
  getCachedIceServers(channelName: string): IceServer[] | null {
    const entry = this.iceServersCache.get(channelName);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.iceServersCache.delete(channelName);
      return null;
    }
    return entry.data;
  }

  /**
   * Stores ICE servers in the cache.
   * @param channelName - Signaling channel name used as the cache key.
   * @param servers - ICE server list to store.
   * @param customTtlMs - Optional TTL override (default 240 s).
   */
  setCachedIceServers(
    channelName: string,
    servers: IceServer[],
    customTtlMs?: number,
  ): void {
    this.iceServersCache.set(channelName, {
      data: servers,
      expiresAt: Date.now() + (customTtlMs ?? ICE_SERVERS_TTL_MS),
    });
  }

  /**
   * Returns cached ICE servers if available, otherwise calls `fetcher` once
   * even if multiple callers arrive simultaneously.
   * @param channelName - Signaling channel name used as the cache key.
   * @param fetcher - Network fetch that resolves ICE servers (+ optional TTL).
   * @returns ICE servers from cache or a single shared fetch.
   */
  getOrFetchIceServers(
    channelName: string,
    fetcher: () => Promise<IceServersFetchResult>,
  ): Promise<IceServer[]> {
    const cached = this.getCachedIceServers(channelName);
    if (cached) return Promise.resolve(cached);

    const existing = this.iceServersInFlight.get(channelName);
    if (existing) return existing;

    const promise = fetcher()
      .then(({ servers, ttlMs }) => {
        this.setCachedIceServers(channelName, servers, ttlMs);
        this.iceServersInFlight.delete(channelName);
        return servers;
      })
      .catch((err: unknown) => {
        this.iceServersInFlight.delete(channelName);
        throw err;
      });

    this.iceServersInFlight.set(channelName, promise);
    return promise;
  }

  /**
   * Clears all cached and in-flight entries for a channel.
   * Call when a connection error suggests cached data may be stale.
   * @param channelName - Signaling channel name whose cache entries to drop.
   */
  clearChannel(channelName: string): void {
    this.channelInfoCache.delete(channelName);
    this.iceServersCache.delete(channelName);
    this.channelInfoInFlight.delete(channelName);
    this.iceServersInFlight.delete(channelName);
  }

  /**
   * Drops all ICE server entries (e.g. after credential refresh).
   * Channel ARN/endpoints are left intact.
   */
  clearIceServers(): void {
    this.iceServersCache.clear();
    this.iceServersInFlight.clear();
  }
}
