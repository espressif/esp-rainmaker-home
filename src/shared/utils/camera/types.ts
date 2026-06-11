/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared camera signaling types used by local-control transport and the
 * WebRTC hook. Cloud KVS types live in `@modules/kvs`.
 */

import type { RTCSessionDescription, RTCIceCandidate } from "react-native-webrtc";

/**
 * Event types emitted by either the cloud KVS or local-control signaling client.
 * Values must stay aligned with `WEBRTC_SIGNALING_EVENTS` / module `SIGNALING_EVENTS`.
 */
export type SignalingEventType =
  | "open"
  | "close"
  | "error"
  | "sdpAnswer"
  | "iceCandidate";

/**
 * Event handler function signature for {@link SignalingTransport}.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- emitter payloads differ per event
export type SignalingEventHandler = (...args: any[]) => void;

/**
 * Common surface implemented by both the cloud KVS signaling client and the
 * local-control signaling client, so the WebRTC hook can use either as a
 * drop-in transport.
 */
export interface SignalingTransport {
  on(event: SignalingEventType, handler: SignalingEventHandler): void;
  off(event: SignalingEventType, handler: SignalingEventHandler): void;
  open(): Promise<void>;
  sendSdpOffer(offer: RTCSessionDescription): void;
  sendIceCandidate(candidate: RTCIceCandidate): void;
  close(): void;
}

/**
 * Local-control transport parameters for a LAN-reachable node. `pop`/`securityType`
 * come from the node's `esp.service.local_control` service params.
 */
export interface LocalTransportConfig {
  /** Device base URL, e.g. `http://192.168.1.42:8080`. */
  baseUrl: string;
  /** esp_local_ctrl security type (0 none, 1 Security1, 2 Security2). */
  securityType: number;
  /** Proof of possession; "" when not required. */
  pop: string;
}
