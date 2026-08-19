/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import * as NavigationBar from "expo-navigation-bar";
import { useRouter, type Href } from "expo-router";
import { Images, Camera as CameraIcon } from "lucide-react-native";

// Hooks
import { useTranslation } from "react-i18next";
import { useCDF } from "@shared/hooks/useCDF";
import { useCameraWebRTC } from "@shared/hooks/useCameraWebRTC";
import { getLocalTransport } from "@shared/utils/camera/getLocalTransport";
import { useCameraCommand } from "../../hooks/useCameraCommand";

// State Management
import { observer } from "mobx-react-lite";

// Components
import {
  VideoPlayer,
  DeviceParamsRenderer,
  WarningBanner,
} from "@shared/components";

// Utils
import { testProps } from "@shared/utils/testProps";
import {
  filterDeviceParamsByType,
  buildParamsMap,
} from "@shared/utils/deviceParams";

// Types
import { ControlPanelProps } from "@src/types/global";

// Constants
import {
  ESPRM_NAME_PARAM_TYPE,
  ESPRM_UI_HIDDEN_PARAM_TYPE,
  ESPRM_CHANNEL_PARAM_TYPE,
} from "@shared/utils/constants";
import { tokens } from "@shared/theme/tokens";

/**
 * Camera Control Panel Component
 * A control panel for camera devices that supports:
 * - YouTube-style video player with play button
 * - Fullscreen toggle (portrait ↔ landscape)
 * - WebRTC video streaming via AWS Kinesis Video Streams
 * - Display of all other device parameters
 * - Warning banner for connection and channel name issues
 *
 * Content-only (no nested ScrollView): Control owns the shared scroll + pull-to-refresh.
 * @param props - Node, device, and optional parent scroll lock callback
 * @returns The rendered camera control panel component
 */
const Camera: React.FC<ControlPanelProps> = ({
  node,
  device,
  setScrollEnabled,
}) => {
  // Hooks
  const { t } = useTranslation();
  const router = useRouter();

  // State
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Computed Values
  const isConnected = node.connectivityStatus?.isConnected || false;
  const nodeId = node.id;

  // Get channel parameter for video streaming
  const channelParam = device?.params?.find(
    (param) => param.type === ESPRM_CHANNEL_PARAM_TYPE
  );
  const channelName = channelParam?.value as string | null;

  // Streaming is gated on having a KVS channel — NOT on the cloud MQTT
  // `isConnected` flag. KVS viewer signaling works whenever the device is
  // present on its signaling channel, so a camera that is "cloud-offline"
  // (MQTT) can still be streamed. (Local-control signaling will extend this.)
  const canStream = !!channelName;

  // Local-control (LAN) signaling config when the node is locally reachable;
  // null → cloud KVS only. Reads the live, discovery-tracked registeredTransports
  // so LAN availability updates reactively (observer re-renders) — no app restart.
  const { store } = useCDF();
  const registeredTransports = store.subscriptionStore.registeredTransports[nodeId];
  const localTransport = getLocalTransport(node, registeredTransports);

  // WebRTC hook
  const {
    isStreaming,
    isLoading,
    error,
    videoStream,
    startStreaming,
    stopStreaming,
    connectionState,
    stats,
    setStatsUpdatesEnabled,
    isMicEnabled,
    toggleMic,
    isSpeakerMuted,
    toggleSpeaker,
  } = useCameraWebRTC(nodeId, channelName, localTransport);

  // Snapshot capture (cloud command-response) — requires cloud connectivity.
  const { capturing, captureSnapshot } = useCameraCommand(nodeId);

  const autoStartAttemptedRef = useRef(false);

  // filtered params (excluding channel and hidden params)
  const filteredParams = useMemo(() => {
    return filterDeviceParamsByType(device?.params, [
      ESPRM_CHANNEL_PARAM_TYPE,
      ESPRM_NAME_PARAM_TYPE,
      ESPRM_UI_HIDDEN_PARAM_TYPE,
    ]);
  }, [device?.params]);

  // Create params map for rendering (memoized for performance)
  const paramsMap = useMemo(() => buildParamsMap(), []);

  // Warning message computation
  const warningMessage = useMemo(() => {
    if (!channelName) {
      return t("device.camera.errors.channelNameRequired");
    }
    return null;
  }, [channelName, t]);

  /**
   * Locks Control's shared ScrollView while a param gesture is active.
   * @param updating - True while the control is being interacted with
   */
  const onSetUpdating = (updating: boolean) => {
    setScrollEnabled?.(!updating);
  };

  /**
   * Handles the play/pause button press for video streaming.
   * Toggles between starting and stopping the video stream. If the device
   * is not connected or channel name is missing, the function returns early
   * (a warning banner will be displayed in the UI).
   */
  const handlePlayPress = () => {
    // Early return if conditions are not met (warning will be shown in UI)
    if (!canStream) {
      return;
    }

    if (isStreaming) {
      stopStreaming();
    } else {
      startStreaming();
    }
  };

  /**
   * Toggles the fullscreen mode state.
   * Switches between fullscreen and normal view modes for the video player.
   * Locks screen orientation to landscape when entering fullscreen,
   * and unlocks it when exiting fullscreen.
   * Uses functional state update to ensure correct state transitions.
   * @returns Promise that resolves when orientation change completes
   */
  const toggleFullscreen = async () => {
    const newFullscreenState = !isFullscreen;
    setIsFullscreen(newFullscreenState);

    try {
      if (newFullscreenState) {
        // Lock to landscape when entering fullscreen
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.LANDSCAPE
        );
        NavigationBar.setBackgroundColorAsync(tokens.colors.black);
      } else {
        // Lock to portrait orientation when exiting fullscreen
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP
        );
        NavigationBar.setBackgroundColorAsync(tokens.colors.white);
      }
    } catch (error) {
      if (__DEV__) {
        console.error("Failed to change screen orientation:", error);
      }
    }
  };

  /**
   * Auto-start the video stream when the panel opens and a channel is available,
   * so the user does not need to tap play first. Runs once per mount; manual stop
   * via the player is respected until the user leaves the screen.
   */
  useEffect(() => {
    if (!canStream || autoStartAttemptedRef.current) {
      return;
    }
    autoStartAttemptedRef.current = true;
    void startStreaming();
  }, [canStream, startStreaming]);

  // Cleanup: restore portrait orientation and white navigation bar when component unmounts
  useEffect(() => {
    return () => {
      // Restore portrait orientation and white navigation bar on unmount
      Promise.all([
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP),
        NavigationBar.setBackgroundColorAsync(tokens.colors.white),
      ]).catch((error) => {
        if (__DEV__) {
          console.error("Failed to restore orientation and navigation bar on unmount:", error);
        }
      });
    };
  }, []);

  return (
    <View style={styles.container} {...testProps("view_camera")}>
      <View {...testProps("scroll_camera")}>
        {/* Warning Banner */}
        {warningMessage && (
          <WarningBanner message={warningMessage} qaId="camera_warning" />
        )}

        {/* Video Player */}
        <View>
          <VideoPlayer
            isPlaying={isStreaming}
            onPlayPress={handlePlayPress}
            onFullscreenPress={toggleFullscreen}
            isFullscreen={isFullscreen}
            videoStream={videoStream}
            isLoading={isLoading}
            error={error}
            connectionState={connectionState}
            stats={stats}
            setStatsUpdatesEnabled={setStatsUpdatesEnabled}
            disabled={!canStream}
            onStop={stopStreaming}
            isMicEnabled={isMicEnabled}
            onMicToggle={toggleMic}
            isSpeakerMuted={isSpeakerMuted}
            onSpeakerToggle={toggleSpeaker}
          />
        </View>

        {/* Capture a new snapshot on the device (cloud command-response) */}
        <Pressable
          style={[
            styles.captureButton,
            (capturing || !isConnected) && styles.captureButtonDisabled,
          ]}
          onPress={captureSnapshot}
          disabled={capturing || !isConnected}
          {...testProps("button_capture_snapshot")}
        >
          {capturing ? (
            <ActivityIndicator size="small" color={tokens.colors.white} />
          ) : (
            <CameraIcon size={18} color={tokens.colors.white} />
          )}
          <Text style={styles.captureButtonText}>
            {capturing
              ? t("device.camera.capture.capturing")
              : t("device.camera.capture.button")}
          </Text>
        </Pressable>

        {/* Gallery entry — view captured snapshots / recordings */}
        <Pressable
          style={styles.galleryButton}
          onPress={() =>
            router.push(
              (`/(control)/Gallery?id=${nodeId}&device=${encodeURIComponent(device?.name ?? "")}`) as Href
            )
          }
          {...testProps("button_open_gallery")}
        >
          <Images size={18} color={tokens.colors.primary} />
          <Text style={styles.galleryButtonText}>{t("device.camera.gallery")}</Text>
        </Pressable>

        {/* Other Parameters */}
        <DeviceParamsRenderer
          params={filteredParams}
          allParams={device?.params || []}
          isConnected={isConnected}
          onSetUpdating={onSetUpdating}
          paramsMap={paramsMap}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  galleryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: tokens.colors.lightGray,
  },
  galleryButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: tokens.colors.primary,
  },
  captureButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: tokens.colors.primary,
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: tokens.colors.white,
  },
});


export default observer(Camera);

