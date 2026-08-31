/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StyleProp, ViewStyle } from "react-native";

/**
 * Props mirrored from `react-native-webrtc` RTCView for the web video element.
 */
export type RTCVideoViewProps = {
  /** Registry key from `MediaStream.toURL()` (not a blob URL). */
  streamURL?: string;
  style?: StyleProp<ViewStyle>;
  objectFit?: "contain" | "cover";
  mirror?: boolean;
  zOrder?: number;
  /**
   * When true (default), HTML video stays muted for autoplay policy.
   * Set false after a user gesture to hear remote audio tracks on the stream.
   */
  muted?: boolean;
};
