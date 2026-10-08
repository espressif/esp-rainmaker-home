/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { getStreamByUrl } from "./streamRegistry";
import type { RTCVideoViewProps } from "./types";

/**
 * Copies only DOM-safe scalar CSS values out of a flattened RN style.
 * Skips numeric keys (from spreading style arrays) and RN array/object values
 * that React DOM would try to assign onto `CSSStyleDeclaration`.
 * @param flat - Flattened RN style object
 * @returns Plain CSS properties suitable for a `<video>` element
 */
function pickDomCssProps(flat: Record<string, unknown>): React.CSSProperties {
  const css: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (/^\d+$/.test(key)) {
      continue;
    }
    if (value == null || Array.isArray(value) || typeof value === "object") {
      continue;
    }
    if (typeof value === "string" || typeof value === "number") {
      css[key] = value;
    }
  }
  return css as React.CSSProperties;
}

/**
 * Flattens RN style props into a DOM-friendly style object for `<video>`.
 * Uses `React.createElement("video")` (not RN View), so style arrays must never
 * reach the DOM — that throws `CSSStyleDeclaration` indexed setter errors.
 * @param style - React Native style prop
 * @param objectFit - CSS object-fit
 * @param mirror - Whether to mirror horizontally
 * @returns Flat CSS properties
 */
function toVideoStyle(
  style: StyleProp<ViewStyle> | undefined,
  objectFit: "contain" | "cover",
  mirror: boolean,
): React.CSSProperties {
  const flattened = StyleSheet.flatten(style);
  const flat =
    flattened != null &&
    typeof flattened === "object" &&
    !Array.isArray(flattened)
      ? (flattened as Record<string, unknown>)
      : {};
  const css = pickDomCssProps(flat);
  return {
    ...css,
    width: css.width ?? "100%",
    height: css.height ?? "100%",
    objectFit,
    transform: mirror ? "scaleX(-1)" : undefined,
    backgroundColor: css.backgroundColor ?? "#000",
  };
}

/**
 * Browser stand-in for `react-native-webrtc` RTCView using an HTML video element.
 * Binds the registered MediaStream via `srcObject` (blob URLs are not valid for streams).
 * Defaults to muted for autoplay; pass `muted={false}` after a user gesture for audio.
 * @param props - RTCView-compatible props (`streamURL`, `objectFit`, `muted`, …)
 * @returns Video element playing the remote WebRTC stream
 */
export function RTCView({
  streamURL,
  style,
  objectFit = "contain",
  mirror = false,
  muted = true,
}: RTCVideoViewProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const stream = getStreamByUrl(streamURL);
    video.srcObject = stream;
    if (!stream) {
      return;
    }
    void video.play().catch(() => {
      /* Autoplay may be blocked until a user gesture; controls still work. */
    });
    return () => {
      video.srcObject = null;
    };
  }, [streamURL]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = muted;
    }
  }, [muted]);

  return React.createElement("video", {
    ref: videoRef,
    autoPlay: true,
    muted,
    playsInline: true,
    controls: false,
    style: toVideoStyle(style, objectFit, mirror),
  });
}

export default RTCView;
