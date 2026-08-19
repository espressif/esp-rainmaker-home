/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Platform } from "react-native";
import InCallManager from "react-native-incall-manager";
import {
  WEBRTC_MEDIA_KIND_VIDEO,
  WEBRTC_LOUDSPEAKER_ROUTE_DELAY_MS,
} from "@shared/utils/constants";

let loudspeakerRouteActive = false;
let loudspeakerRouteTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Re-applies loudspeaker routing after a short delay. iOS WebRTC sometimes
 * resets the audio route until the remote track is fully active.
 */
function scheduleForceLoudspeaker(): void {
  if (loudspeakerRouteTimer) {
    clearTimeout(loudspeakerRouteTimer);
  }
  loudspeakerRouteTimer = setTimeout(() => {
    loudspeakerRouteTimer = null;
    if (!loudspeakerRouteActive) return;
    try {
      InCallManager.setSpeakerphoneOn(true);
      InCallManager.setForceSpeakerphoneOn(true);
    } catch {
      // Non-fatal — routing may already be correct.
    }
  }, WEBRTC_LOUDSPEAKER_ROUTE_DELAY_MS);
}

/**
 * Routes WebRTC camera audio to the device loudspeaker (media-style) instead of
 * the earpiece. Safe to call multiple times while a stream is active.
 */
export function startWebRtcLoudspeakerRouting(): void {
  if (Platform.OS === "web") return;

  if (loudspeakerRouteActive) {
    scheduleForceLoudspeaker();
    return;
  }

  loudspeakerRouteActive = true;
  try {
    InCallManager.start({ media: WEBRTC_MEDIA_KIND_VIDEO, auto: true });
    InCallManager.setForceSpeakerphoneOn(true);
    scheduleForceLoudspeaker();
  } catch (err) {
    if (__DEV__) {
      console.warn("Failed to start WebRTC loudspeaker routing:", err);
    }
  }
}

/**
 * Restores default audio routing when the camera WebRTC session ends.
 */
export function stopWebRtcAudioRouting(): void {
  if (loudspeakerRouteTimer) {
    clearTimeout(loudspeakerRouteTimer);
    loudspeakerRouteTimer = null;
  }
  if (!loudspeakerRouteActive) return;

  loudspeakerRouteActive = false;
  try {
    InCallManager.stop();
  } catch (err) {
    if (__DEV__) {
      console.warn("Failed to stop WebRTC audio routing:", err);
    }
  }
}
