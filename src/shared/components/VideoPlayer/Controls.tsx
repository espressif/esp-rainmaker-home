/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, StyleSheet, TouchableOpacity, Pressable, ActivityIndicator } from "react-native";
import { Play, Maximize2, X, Info } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { videoPlayerStyles } from "@shared/theme/VideoPlayerStyle";
import { testProps } from "@shared/utils/testProps";
import ConnectionStateBadge from "./ConnectionStateBadge";
import { ConnectionState } from "@src/types/global";
import type { ControlsProps } from "@src/types/global";

/**
 * Controls Component
 *
 * Handles all video player controls:
 * - Play button (portrait mode only)
 * - Fullscreen toggle button (portrait mode)
 * - Exit fullscreen button (fullscreen mode)
 * - LIVE indicator
 * - Long press handler for stats (fullscreen mode)
 *
 * Follows Single Responsibility Principle - only responsible for UI controls
 */
const Controls: React.FC<ControlsProps> = ({
    isPlaying,
    isFullscreen,
    hasVideoStream,
    isLoading,
    error,
    connectionState,
    disabled = false,
    onPlayPress,
    onFullscreenPress,
    onLongPress,
    onStatsPress,
    safeAreaInsets,
}) => {
    // Map connection state string to ConnectionState enum
    const getConnectionStateEnum = (): ConnectionState => {
        switch (connectionState) {
            case "connected":
                return ConnectionState.CONNECTED;
            case "disconnected":
                return ConnectionState.DISCONNECTED;
            case "live":
                return ConnectionState.LIVE;
            case "error":
                return ConnectionState.ERROR;
            default:
                return ConnectionState.DISCONNECTED;
        }
    };

    // Fullscreen mode: Top-right controls (Close button + Connection State Badge)
    if (isFullscreen) {
        // Show play button when not connected, not playing, loading, OR errored
        // (so an error is recoverable in place — tapping play retries instead of
        // forcing the user back to the device list).
        const showPlayButton =
            connectionState === "disconnected" ||
            !!error ||
            (!isPlaying && !hasVideoStream) ||
            isLoading;

        return (
            <View style={[videoPlayerStyles.controlsFullscreenContainer, disabled && { opacity: 0.7 }]}>
                {/* Top-right controls container — offset by safe-area insets so
                    the buttons stay clear of the notch / nav bar in landscape. */}
                <View
                    style={[
                        videoPlayerStyles.fullscreenTopRightControls,
                        {
                            top: 16 + (safeAreaInsets?.top ?? 0),
                            right: 16 + (safeAreaInsets?.right ?? 0),
                        },
                    ]}
                >
                    {/* Connection State Badge */}
                    <ConnectionStateBadge
                        state={getConnectionStateEnum()}
                        testId="connection_state_badge_fullscreen"
                    />

                    {/* Info Button - Show when connection is live */}
                    {connectionState === "live" && onStatsPress && (
                        <TouchableOpacity
                            style={videoPlayerStyles.infoButton}
                            onPress={onStatsPress}
                            disabled={disabled}
                            {...testProps("button_video_stats_info")}
                        >
                            <Info size={20} color={tokens.colors.black} />
                        </TouchableOpacity>
                    )}

                    {/* Close Button (X) */}
                    <TouchableOpacity
                        style={videoPlayerStyles.closeButton}
                        onPress={onFullscreenPress}
                        disabled={disabled}
                        {...testProps("button_video_close_fullscreen")}
                    >
                        <X size={20} color={tokens.colors.black} />
                    </TouchableOpacity>
                </View>

                {/* Centered Play Button - Only in fullscreen when not connected */}
                {showPlayButton && !isLoading && (
                    <View style={videoPlayerStyles.fullscreenPlayButtonContainer}>
                        <TouchableOpacity
                            style={videoPlayerStyles.fullscreenPlayButton}
                            onPress={onPlayPress}
                            disabled={isLoading || disabled}
                            {...testProps("button_video_play_fullscreen")}
                        >
                           <Play size={40} color={tokens.colors.white} fill={tokens.colors.white} />
                        </TouchableOpacity>
                    </View>
                )}

                {/* Long Press Handler - Only in fullscreen mode */}
                {isPlaying && onLongPress && (
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onLongPress={onLongPress}
                        delayLongPress={500}
                        hitSlop={0}
                        pointerEvents="auto"
                    />
                )}
            </View>
        );
    }

    // Portrait mode: Controls outside video container
    // Connection state badge on left, controls on right using space-between
    return (
        <View style={[videoPlayerStyles.portraitContainer, disabled && { opacity: 0.7 }]}>
            {/* Connection State Badge - Left-aligned */}
            <View style={videoPlayerStyles.portraitBadgeContainer}>
                <ConnectionStateBadge
                    state={getConnectionStateEnum()}
                    testId="connection_state_badge_portrait"
                />
            </View>

            {/* Right-aligned controls */}
            <View style={videoPlayerStyles.portraitControlsRow}>
                {/* Play Button - show when not playing, loading, OR errored
                    (tapping it retries the stream in place). */}
                {(!isPlaying && !hasVideoStream) || !!error || isLoading ? (
                    <TouchableOpacity
                        style={videoPlayerStyles.portraitPlayButton}
                        onPress={onPlayPress}
                        disabled={isLoading || disabled}
                        {...testProps("button_video_play")}
                    >
                        {isLoading ? (
                            <ActivityIndicator size="small" color={tokens.colors.gray} />
                        ) : (
                            <Play size={20} color={tokens.colors.gray} fill={tokens.colors.gray} />
                        )}
                    </TouchableOpacity>
                ) : null}

                {/* Info Button - Show when connection is live */}
                {connectionState === "live" && onStatsPress && (
                    <TouchableOpacity
                        style={videoPlayerStyles.portraitInfoButton}
                        onPress={onStatsPress}
                        disabled={disabled}
                        {...testProps("button_video_stats_info_portrait")}
                    >
                        <Info size={20} color={tokens.colors.gray} />
                    </TouchableOpacity>
                )}

                {/* Fullscreen Button */}
                <TouchableOpacity
                    style={videoPlayerStyles.portraitFullscreenButton}
                    onPress={onFullscreenPress}
                    disabled={disabled}
                    {...testProps("button_video_fullscreen")}
                >
                    <Maximize2 size={20} color={tokens.colors.gray} />
                </TouchableOpacity>
            </View>
        </View>
    );
};

export default Controls;
