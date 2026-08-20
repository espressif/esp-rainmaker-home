/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `@modules/kvs` — AWS Kinesis Video Streams client suite.
 *
 * Pass region + credentials once via {@link createKvsClient}, then call
 * services (`archived`, `signaling`). Host apps own credential acquisition
 * and RN polyfills (crypto / get-random-values) before opening signaling.
 * Prefer {@link KvsClient.updateCredentials} when STS tokens refresh.
 */

export type { AwsCredentials, KvsClientConfig } from "./types";

export type {
  KvsTimeRange,
  ListFragmentsOptions,
  GetThumbnailsOptions,
  GetHlsUrlOptions,
  KvsFragment,
  KvsThumbnail,
} from "./services/archived";

export type {
  SignalingEventType,
  SignalingEventHandler,
  SignalingEventMap,
  SignalingClientConfig,
  CreateViewerClientOptions,
  CachedChannelInfo,
  IceServer,
  IceServersFetchResult,
  SignalingMessage,
  MessageHandler,
} from "./services/signaling";

export { KvsClient, createKvsClient } from "./client";
export { KvsArchivedMediaService } from "./services/archived";
export {
  KvsSignalingService,
  KvsSignalingClient,
  SIGNALING_EVENTS,
} from "./services/signaling";
