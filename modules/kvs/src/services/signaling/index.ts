/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Signaling service public face: channel discovery, ICE, and viewer WebSocket.
 * Import from this module (or `@modules/kvs`) — not from internal files.
 * Channel/ICE cache is internal to {@link KvsSignalingService}.
 */

export { KvsSignalingService } from "./service";
export { KvsSignalingClient } from "./transport";
export { SIGNALING_EVENTS } from "./constants";
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
} from "./types";
