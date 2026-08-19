/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet } from "react-native";
import { tokens } from "@shared/theme/tokens";

/**
 * VideoPlayer Styles
 * 
 * Centralized styles for VideoPlayer component and its sub-components:
 * - VideoPlayer
 * - ConnectionStateBadge
 * - Controls
 * - Stats
 */
export const videoPlayerStyles = StyleSheet.create({
  // VideoPlayer styles
  container: {
    backgroundColor: tokens.colors.black,
    position: "relative",
    overflow: "hidden", // Clip children to rounded corners
    borderRadius: tokens.radius.md, // Rounded corners like Samsung Home
    width: "100%", // Fit to parent container width
    aspectRatio: 16 / 9, // Maintain 16:9 aspect ratio
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenContainer: {
    position: "absolute",
    // top, left, bottom, right will be set dynamically with negative insets
    backgroundColor: tokens.colors.black,
    zIndex: 9999,
    elevation: 20,
  },
  videoContainer: {
    backgroundColor: tokens.colors.black,
    // Parent controls layout - RTCView just fills this
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    width: "100%",
    height: "100%",
    borderRadius: tokens.radius.md, // Rounded corners like Samsung Home
  },
  placeholderContainer: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    position: "absolute",
  },
  placeholderBackground: {
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
    backgroundColor: tokens.colors.black,
    opacity: 0.8,
  },
  loadingContainer: {
    position: "absolute",
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    // Use rgba with black color (0, 0, 0) for overlay - 70% opacity
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    zIndex: 50, // Ensure loading indicator appears on top of video
  },
  loadingText: {
    color: tokens.colors.white,
    fontSize: tokens.fontSize.sm,
  },
  errorContainer: {
    position: "absolute",
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    // Use rgba with black color (0, 0, 0) for overlay - 80% opacity
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  videoElement: {
    // RTCView should fill its container completely
    width: "100%",
    height: "100%",
    backgroundColor: tokens.colors.black,
  },
  // ConnectionStateBadge styles
  badge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  // Controls styles
  controlsFullscreenContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 30,
    bottom: 0,
    zIndex: 2000,
    pointerEvents: "box-none", // Allow touches to pass through
  },
  fullscreenTopRightControls: {
    position: "absolute",
    top: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 1000,
  },
  closeButton: {
    backgroundColor: tokens.colors.white,
    borderRadius: 20,
    width: 25,
    height: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  infoButton: {
    backgroundColor: tokens.colors.white,
    borderRadius: 20,
    width: 25,
    height: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenPlayButtonContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  fullscreenPlayButton: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 50,
    width: 80,
    height: 80,
    justifyContent: "center",
    alignItems: "center",
  },
  portraitContainer: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    paddingLeft: 8,
    paddingRight: 8,
  },
  portraitControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  portraitPlayButton: {
    borderRadius: 20,
    width: 25,
    height: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  portraitFullscreenButton: {
    borderRadius: 20,
    width: 25,
    height: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  portraitBadgeContainer: {
    alignItems: "flex-start",
  },
  portraitInfoButton: {
    borderRadius: 20,
    width: 25,
    height: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  // Stats styles - Drawer from left
  statsOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  statsDrawer: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: 300,
    backgroundColor: tokens.colors.white,
    zIndex: 1001,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingLeft:80,
  },
  statsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  statsCloseButton: {
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  statsContainer: {
    flex: 1,
  },
  statsTitle: {
    color: tokens.colors.black,
    fontSize: 16,
    fontWeight: "700",
  },
  statsSection: {
    marginBottom: 16,
  },
  statsSectionTitle: {
    color: tokens.colors.gray,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: "row",
    marginBottom: 8,
    gap: 8,
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    color: tokens.colors.gray,
    fontSize: 11,
    marginBottom: 4,
  },
  statValue: {
    color: tokens.colors.black,
    fontSize: 11,
    fontWeight: "500",
  },
  // Inline stats for portrait mode
  statsInlineContainer: {
    width: "100%",
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.md,
    padding: 16,
    marginTop: 8,
    maxHeight: 400,
  },
  statsPortraitWrapper: {
    width: "100%",
    marginTop: 16,
    paddingLeft:10,
  },
  // In-video media overlay (tap-to-show, auto-hide): stop-square + audio toggles
  mediaOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  overlayStopButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  overlayToggleRow: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    flexDirection: "row",
    gap: 16,
  },
  overlayToggleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
});
