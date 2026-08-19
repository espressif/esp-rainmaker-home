/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, TouchableOpacity } from "react-native";
import { Mic, MicOff, Volume2, VolumeX, Square } from "lucide-react-native";

import { tokens } from "@shared/theme/tokens";
import { videoPlayerStyles } from "@shared/theme/VideoPlayerStyle";
import { testProps } from "@shared/utils/testProps";

/** Props for the in-video media overlay. */
interface MediaOverlayProps {
  /** Whether the player is fullscreen (adjusts the toggle-row safe-area offset). */
  isFullscreen: boolean;
  /** Stops the stream (center stop-square button). */
  onStop: () => void;
  /** Whether the mic (audio send) is currently on. */
  isMicEnabled: boolean;
  /** Toggles the mic. */
  onMicToggle: () => void;
  /** Whether the incoming device audio is muted. */
  isSpeakerMuted: boolean;
  /** Toggles incoming-audio mute. */
  onSpeakerToggle: () => void;
  /** Safe-area insets, used to keep the toggle row clear of the nav bar in landscape. */
  safeAreaInsets?: { top: number; right: number; bottom: number; left: number };
}

/**
 * In-video overlay shown (briefly, tap-to-toggle) while the stream is playing:
 * a center stop-square plus mic-send and incoming-audio mute toggles. There is
 * intentionally no video-send control — the viewer is one-way video.
 * @param props - Overlay props.
 * @returns The overlay element.
 */
const MediaOverlay: React.FC<MediaOverlayProps> = ({
  isFullscreen,
  onStop,
  isMicEnabled,
  onMicToggle,
  isSpeakerMuted,
  onSpeakerToggle,
  safeAreaInsets,
}) => {
  return (
    <View style={videoPlayerStyles.mediaOverlay} pointerEvents="box-none">
      {/* Center stop-square — stops playback */}
      <TouchableOpacity
        style={videoPlayerStyles.overlayStopButton}
        onPress={onStop}
        {...testProps("button_video_stop")}
      >
        <Square size={22} color={tokens.colors.white} fill={tokens.colors.white} />
      </TouchableOpacity>

      {/* Audio toggles */}
      <View
        style={[
          videoPlayerStyles.overlayToggleRow,
          isFullscreen ? { bottom: 16 + (safeAreaInsets?.bottom ?? 0) } : null,
        ]}
      >
        <TouchableOpacity
          style={videoPlayerStyles.overlayToggleButton}
          onPress={onMicToggle}
          {...testProps("button_video_mic_toggle")}
        >
          {isMicEnabled ? (
            <Mic size={20} color={tokens.colors.white} />
          ) : (
            <MicOff size={20} color={tokens.colors.white} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={videoPlayerStyles.overlayToggleButton}
          onPress={onSpeakerToggle}
          {...testProps("button_video_speaker_toggle")}
        >
          {isSpeakerMuted ? (
            <VolumeX size={20} color={tokens.colors.white} />
          ) : (
            <Volume2 size={20} color={tokens.colors.white} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default MediaOverlay;
