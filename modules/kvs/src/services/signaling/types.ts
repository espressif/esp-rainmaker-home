/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RTCIceCandidate, RTCSessionDescription } from "react-native-webrtc";
import type { AwsCredentials } from "../../types";

/**
 * Events emitted by the KVS WebSocket signaling client.
 * Keep values aligned with host `WEBRTC_SIGNALING_EVENTS`.
 */
export type SignalingEventType =
  | "open"
  | "close"
  | "error"
  | "sdpAnswer"
  | "iceCandidate";

/**
 * Payload map for {@link KvsSignalingClient} events.
 * Use with typed `on` / `off` for compile-time handler safety.
 */
export type SignalingEventMap = {
  open: undefined;
  close: undefined;
  error: Error;
  sdpAnswer: RTCSessionDescription;
  iceCandidate: RTCIceCandidate;
};

/**
 * Listener for a single signaling event key.
 * @typeParam K - Event name from {@link SignalingEventMap}.
 */
export type SignalingEventHandler<K extends SignalingEventType> =
  SignalingEventMap[K] extends undefined
    ? () => void
    : (payload: SignalingEventMap[K]) => void;

/**
 * Configuration for {@link KvsSignalingClient}.
 * `credentials.sessionToken` is required for assume-role SigV4 signing.
 */
export interface SignalingClientConfig {
  channelARN: string;
  channelEndpoint: string;
  clientId: string;
  region: string;
  credentials: AwsCredentials;
}

/** Options to open a viewer WebSocket client from {@link KvsSignalingService}. */
export interface CreateViewerClientOptions {
  channelARN: string;
  /** WSS resource endpoint from channel discovery. */
  channelEndpoint: string;
  /** Unique viewer client id (UUID). */
  clientId: string;
}

/** Cached DescribeSignalingChannel + GetSignalingChannelEndpoint result. */
export interface CachedChannelInfo {
  channelARN: string;
  wssEndpoint: string;
  httpsEndpoint: string;
}

/** RTCConfiguration-compatible ICE server entry. */
export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

/**
 * Return type for ICE fetchers used by the channel cache.
 * Optional `ttlMs` overrides the default ICE cache TTL.
 */
export interface IceServersFetchResult {
  servers: IceServer[];
  ttlMs?: number;
}

/** Inbound KVS signaling WebSocket JSON envelope. */
export type SignalingMessage = {
  messageType?: string;
  action?: string;
  messagePayload?: string;
};

/** Handler for a decoded inbound signaling message. */
export type MessageHandler = (message: SignalingMessage) => void;
