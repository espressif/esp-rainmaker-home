/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** Cache TTL for signaling channel ARN + endpoints (channel identity is stable). */
export const CHANNEL_INFO_TTL_MS = 24 * 60 * 60 * 1000;

/** Default ICE credential cache TTL (AWS credentials expire at ~300 s). */
export const ICE_SERVERS_TTL_MS = 240 * 1000;

/** Seconds subtracted from AWS ICE TTL before caching (avoid near-expiry). */
export const ICE_SERVERS_TTL_SKEW_SECONDS = 60;

/** SingleMaster channel role for the mobile viewer. */
export const SIGNALING_CHANNEL_ROLE_VIEWER = "VIEWER";

/** Signaling endpoint protocols requested from GetSignalingChannelEndpoint. */
export const SIGNALING_PROTOCOL_WSS = "WSS";
export const SIGNALING_PROTOCOL_HTTPS = "HTTPS";

/** SigV4 signed WebSocket URL lifetime (seconds). */
export const SIGV4_EXPIRES_SECONDS = "299";

/** Max time to wait for WebSocket `onopen` before rejecting `open()`. */
export const WEBSOCKET_OPEN_TIMEOUT_MS = 30_000;

/** Error when WebSocket open times out. */
export const ERROR_WEBSOCKET_OPEN_TIMEOUT =
  "Timed out waiting for KVS signaling WebSocket to open";

/** Error when the socket closes before it finishes opening. */
export const ERROR_WEBSOCKET_CLOSED_BEFORE_OPEN =
  "KVS signaling WebSocket closed before open completed";

/** AWS service name used in SigV4 credential scope for KVS. */
export const SIGV4_SERVICE_KINESISVIDEO = "kinesisvideo";

/** SigV4 algorithm / signed-headers query values. */
export const SIGV4_ALGORITHM = "AWS4-HMAC-SHA256";
export const SIGV4_SIGNED_HEADERS = "host";

/** KVS signaling wire message types (inbound). */
export const SIGNALING_MESSAGE_SDP_ANSWER = "SDP_ANSWER";
export const SIGNALING_MESSAGE_ICE_CANDIDATE = "ICE_CANDIDATE";
export const SIGNALING_MESSAGE_STATUS_RESPONSE = "STATUS_RESPONSE";

/** KVS signaling wire actions (outbound). */
export const SIGNALING_ACTION_SDP_OFFER = "SDP_OFFER";
export const SIGNALING_ACTION_ICE_CANDIDATE = "ICE_CANDIDATE";

/** HTTP-equivalent success code in STATUS_RESPONSE payloads. */
export const SIGNALING_STATUS_OK = "200";

/** SDP session description type for answers. */
export const SDP_TYPE_ANSWER = "answer";
export const SDP_TYPE_OFFER = "offer";

/**
 * Events emitted by {@link KvsSignalingClient}.
 * String values must stay aligned with app `WEBRTC_SIGNALING_EVENTS`.
 */
export const SIGNALING_EVENTS = {
  OPEN: "open",
  CLOSE: "close",
  ERROR: "error",
  SDP_ANSWER: "sdpAnswer",
  ICE_CANDIDATE: "iceCandidate",
} as const;

/** Error when DescribeSignalingChannel returns no ARN. */
export const ERROR_CHANNEL_ARN_MISSING =
  "Failed to get KVS signaling channel ARN. Channel may not exist.";

/** Error when GetSignalingChannelEndpoint omits WSS or HTTPS. */
export const ERROR_SIGNALING_ENDPOINTS_MISSING =
  "Failed to get KVS signaling endpoints.";
