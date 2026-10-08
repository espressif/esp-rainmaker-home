/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Browser entry that Metro substitutes for `react-native-webrtc` on web.
 * Re-exports browser WebRTC globals plus a DOM RTCView with MediaStream.toURL parity.
 */

import { RTCView } from "./RTCView";
import { ensureMediaStreamToURL } from "./streamRegistry";
import type { RTCVideoViewProps } from "./types";

ensureMediaStreamToURL();

export { RTCView };

export const RTCPeerConnection = globalThis.RTCPeerConnection;
export const RTCSessionDescription = globalThis.RTCSessionDescription;
export const RTCIceCandidate = globalThis.RTCIceCandidate;
export const MediaStream = globalThis.MediaStream;
export const MediaStreamTrack = globalThis.MediaStreamTrack;

/** Browser mediaDevices for upcoming mic / local capture paths. */
export const mediaDevices =
  typeof navigator !== "undefined" && navigator.mediaDevices
    ? navigator.mediaDevices
    : ({} as MediaDevices);

export type { RTCVideoViewProps };
/** DOM track settings (parity with react-native-webrtc export). */
export type MediaTrackSettings = globalThis.MediaTrackSettings;
