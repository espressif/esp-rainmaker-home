/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { STREAM_URL_PREFIX } from "./constants";

type StreamWithTag = globalThis.MediaStream & { _reactTag?: string };

const streamByUrl = new Map<string, globalThis.MediaStream>();
let nextStreamId = 0;

/**
 * Registers a browser MediaStream and returns a stable id for `RTCView streamURL`.
 * Matches react-native-webrtc `toURL()` (a tag, not a blob URL).
 * @param stream - Live MediaStream from RTCPeerConnection
 * @returns Registry key consumed by web `RTCView`
 */
export function registerStream(stream: globalThis.MediaStream): string {
  const tagged = stream as StreamWithTag;
  if (tagged._reactTag && streamByUrl.get(tagged._reactTag) === stream) {
    return tagged._reactTag;
  }
  const url = `${STREAM_URL_PREFIX}${nextStreamId++}`;
  tagged._reactTag = url;
  streamByUrl.set(url, stream);
  return url;
}

/**
 * Looks up the MediaStream previously registered via `toURL()`.
 * @param streamURL - Value from `MediaStream.toURL()`
 * @returns The stream, or null if unknown / empty
 */
export function getStreamByUrl(
  streamURL: string | undefined,
): globalThis.MediaStream | null {
  if (!streamURL) {
    return null;
  }
  return streamByUrl.get(streamURL) ?? null;
}

/**
 * Removes a stream from the registry (call on teardown to avoid leaks).
 * @param streamURL - Key previously returned by `toURL()` / `registerStream`
 */
export function unregisterStream(streamURL: string | undefined): void {
  if (!streamURL) {
    return;
  }
  const stream = streamByUrl.get(streamURL);
  if (stream) {
    const tagged = stream as StreamWithTag;
    if (tagged._reactTag === streamURL) {
      delete tagged._reactTag;
    }
  }
  streamByUrl.delete(streamURL);
}

/**
 * Adds RN-webrtc's `toURL()` on the browser MediaStream prototype.
 * Uses a registry instead of `URL.createObjectURL`, which browsers no longer
 * accept for MediaStream.
 */
export function ensureMediaStreamToURL(): void {
  const Ctor = globalThis.MediaStream;
  if (!Ctor) {
    return;
  }
  const proto = Ctor.prototype as StreamWithTag & { toURL?: () => string };
  if (typeof proto.toURL === "function") {
    return;
  }
  proto.toURL = function toURL(this: globalThis.MediaStream): string {
    return registerStream(this);
  };
}
