/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { KvsArchivedMediaService } from "./services/archived";
import { KvsSignalingService } from "./services/signaling";
import type { AwsCredentials, KvsClientConfig } from "./types";

/**
 * Root KVS client: pass region + credentials once, then use named services.
 *
 * Available:
 * - {@link KvsClient.archived} — fragments, thumbnails, HLS
 * - {@link KvsClient.signaling} — channel discovery, ICE, viewer WebSocket
 */
export class KvsClient {
  /** Archived-media suite for recorded streams. */
  readonly archived: KvsArchivedMediaService;
  /** WebRTC signaling suite for live camera viewing. */
  readonly signaling: KvsSignalingService;

  /**
   * Binds shared region and credentials for all KVS services.
   * @param config - AWS region and credentials.
   */
  constructor(config: KvsClientConfig) {
    this.archived = new KvsArchivedMediaService(
      config.region,
      config.credentials,
    );
    this.signaling = new KvsSignalingService(
      config.region,
      config.credentials,
    );
  }

  /**
   * Refreshes temporary AWS credentials on both services (e.g. after STS
   * renew). Prefer this over creating a new client when only tokens change.
   * Create a new client if the region changes.
   * @param credentials - Fresh temporary AWS credentials.
   */
  updateCredentials(credentials: AwsCredentials): void {
    this.archived.updateCredentials(credentials);
    this.signaling.updateCredentials(credentials);
  }
}

/**
 * Creates a credentials-bound KVS client with the full service suite.
 * @param config - AWS region and credentials.
 * @returns A {@link KvsClient} ready for `archived` and `signaling`.
 */
export function createKvsClient(config: KvsClientConfig): KvsClient {
  return new KvsClient(config);
}
