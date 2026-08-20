/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect } from "react";
import {
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Reanimated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { tokens } from "@shared/theme/tokens";
import {
  PLATFORM_IOS,
  QR_SCANNER_GUIDE_WIDTH_RATIO,
} from "@shared/utils/constants";
import type { DetectedQrBounds } from "@shared/utils/qrBounds";
import { testProps } from "@shared/utils/testProps";

/** iOS CAGradientLayer treats CSS `transparent` as black — use white @ 0 alpha. */
const GRADIENT_WHITE_CLEAR = "rgba(255,255,255,0)";
/** True when running on iOS (camera overlay cost + gradient quirks). */
const IS_IOS = Platform.OS === PLATFORM_IOS;
const { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } = Dimensions.get("window");
const SCANNER_WIDTH = WINDOW_WIDTH * QR_SCANNER_GUIDE_WIDTH_RATIO;
/** Keeps the scan line inside the guide frame, clear of corner markers. */
const SCAN_LINE_INSET = 20;
/** Smooth guide → detected-QR frame morph duration. */
const QR_FRAME_TRANSITION_MS = 340;
const QR_FRAME_EASING = Easing.out(Easing.cubic);

export interface QrScanOverlayProps {
  /** Idle vs locked: stops scan line; morphs when bounds are set. */
  scanned: boolean;
  /** Overlay coords for the detected QR; null keeps the guide square. */
  detectedQrBounds: DetectedQrBounds | null;
  /** Solid red corners (invalid / failed scan). */
  hasFailed?: boolean;
  /** Hint under the guide while idle; omit or null to hide. */
  hintText?: string | null;
  /** Reports overlay size for barcode → overlay mapping. */
  onOverlaySizeChange?: (width: number, height: number) => void;
}

/**
 * Renders the four corner markers for a scan / detected-QR frame.
 * @param failed - Solid red corners, no shimmer
 * @param shimmering - White corners pulse while connecting / processing
 */
const ScanFrameCorners = ({
  failed = false,
  shimmering = false,
}: {
  failed?: boolean;
  shimmering?: boolean;
}) => {
  const shimmer = useSharedValue(1);

  useEffect(() => {
    if (failed || !shimmering) {
      shimmer.value = withTiming(1, { duration: 160 });
      return;
    }
    shimmer.value = withRepeat(
      withTiming(0.35, {
        duration: 700,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );
  }, [failed, shimmer, shimmering]);

  const cornerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: failed ? 1 : shimmer.value,
  }));

  const borderColor = failed ? tokens.colors.red : tokens.colors.white;

  return (
    <>
      <Reanimated.View
        {...testProps("view_corner_top_left")}
        style={[
          styles.cornerMarker,
          styles.topLeft,
          { borderColor },
          cornerAnimatedStyle,
        ]}
      />
      <Reanimated.View
        {...testProps("view_corner_top_right")}
        style={[
          styles.cornerMarker,
          styles.topRight,
          { borderColor },
          cornerAnimatedStyle,
        ]}
      />
      <Reanimated.View
        {...testProps("view_corner_bottom_left")}
        style={[
          styles.cornerMarker,
          styles.bottomLeft,
          { borderColor },
          cornerAnimatedStyle,
        ]}
      />
      <Reanimated.View
        {...testProps("view_corner_bottom_right")}
        style={[
          styles.cornerMarker,
          styles.bottomRight,
          { borderColor },
          cornerAnimatedStyle,
        ]}
      />
    </>
  );
};

/**
 * Reanimated scan guide that morphs onto detected QR bounds.
 *
 * Domain-agnostic: copy and fail/scanned state come from the parent.
 * @param props - Overlay state and optional hint
 */
export function QrScanOverlay({
  scanned,
  detectedQrBounds,
  hasFailed = false,
  hintText,
  onOverlaySizeChange,
}: QrScanOverlayProps) {
  const overlayWidth = useSharedValue(WINDOW_WIDTH);
  const overlayHeight = useSharedValue(WINDOW_HEIGHT);
  const frameLeft = useSharedValue((WINDOW_WIDTH - SCANNER_WIDTH) / 2);
  const frameTop = useSharedValue((WINDOW_HEIGHT - SCANNER_WIDTH) / 2);
  const frameWidth = useSharedValue(SCANNER_WIDTH);
  const frameHeight = useSharedValue(SCANNER_WIDTH);
  const scanLineOpacity = useSharedValue(1);
  const scanLineProgress = useSharedValue(0);

  /**
   * Places the frame on the centered guide square (no animation).
   * @param ow - Overlay width
   * @param oh - Overlay height
   */
  const snapToGuideFrame = useCallback(
    (ow: number, oh: number) => {
      frameLeft.value = (ow - SCANNER_WIDTH) / 2;
      frameTop.value = (oh - SCANNER_WIDTH) / 2;
      frameWidth.value = SCANNER_WIDTH;
      frameHeight.value = SCANNER_WIDTH;
      scanLineOpacity.value = 1;
    },
    [frameHeight, frameLeft, frameTop, frameWidth, scanLineOpacity],
  );

  /**
   * Animates the frame onto the detected QR rect (ratio preserved).
   * @param bounds - Detected QR frame in overlay coordinates
   */
  const animateToDetectedQr = useCallback(
    (bounds: DetectedQrBounds) => {
      const timing = {
        duration: QR_FRAME_TRANSITION_MS,
        easing: QR_FRAME_EASING,
      };
      frameLeft.value = withTiming(bounds.x, timing);
      frameTop.value = withTiming(bounds.y, timing);
      frameWidth.value = withTiming(bounds.width, timing);
      frameHeight.value = withTiming(bounds.height, timing);
      scanLineOpacity.value = withTiming(0, { duration: 160 });
    },
    [frameHeight, frameLeft, frameTop, frameWidth, scanLineOpacity],
  );

  useEffect(() => {
    if (scanned || hasFailed) {
      cancelAnimation(scanLineProgress);
      if (detectedQrBounds) {
        animateToDetectedQr(detectedQrBounds);
      } else {
        scanLineOpacity.value = withTiming(0, { duration: 160 });
      }
      return;
    }

    const lineDuration = IS_IOS ? 2600 : 2000;
    scanLineProgress.value = 0;
    scanLineProgress.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: lineDuration,
          easing: Easing.inOut(Easing.quad),
        }),
        withTiming(0, {
          duration: lineDuration,
          easing: Easing.inOut(Easing.quad),
        }),
      ),
      -1,
      false,
    );
    snapToGuideFrame(overlayWidth.value, overlayHeight.value);
    scanLineOpacity.value = withTiming(1, { duration: 200 });
  }, [
    animateToDetectedQr,
    detectedQrBounds,
    hasFailed,
    overlayHeight,
    overlayWidth,
    scanned,
    scanLineOpacity,
    scanLineProgress,
    snapToGuideFrame,
  ]);

  /**
   * Records overlay size so the guide frame stays centered.
   * @param event - Layout event from the overlay
   */
  const handleOverlayLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width: ow, height: oh } = event.nativeEvent.layout;
      overlayWidth.value = ow;
      overlayHeight.value = oh;
      onOverlaySizeChange?.(ow, oh);
      if (!scanned && !hasFailed) {
        snapToGuideFrame(ow, oh);
      }
    },
    [
      hasFailed,
      onOverlaySizeChange,
      overlayHeight,
      overlayWidth,
      scanned,
      snapToGuideFrame,
    ],
  );

  const frameAnimatedStyle = useAnimatedStyle(() => ({
    left: frameLeft.value,
    top: frameTop.value,
    width: frameWidth.value,
    height: frameHeight.value,
  }));

  const scanLineAnimatedStyle = useAnimatedStyle(() => {
    const travel = Math.max(frameHeight.value - SCAN_LINE_INSET * 2, 0);
    const lineWidth = Math.max(frameWidth.value - SCAN_LINE_INSET * 2, 0);
    return {
      opacity: scanLineOpacity.value,
      left: SCAN_LINE_INSET,
      width: lineWidth,
      transform: [
        {
          translateY: SCAN_LINE_INSET + scanLineProgress.value * travel,
        },
      ],
    };
  });

  return (
    <View
      {...testProps("view_scanner_overlay")}
      style={styles.scannerOverlayClear}
      pointerEvents="none"
      onLayout={handleOverlayLayout}
    >
      <Reanimated.View
        {...testProps("view_scanner_frame")}
        style={[styles.scannerFrame, styles.animatedQrFrame, frameAnimatedStyle]}
      >
        <ScanFrameCorners
          failed={hasFailed}
          shimmering={scanned && !hasFailed}
        />
        <Reanimated.View
          {...testProps("view_scan_line")}
          style={[styles.scanLine, scanLineAnimatedStyle]}
        >
          {/*
            LinearGradient over a live CameraView is costly on iOS and
            `transparent` stops paint as black. Use a solid line on iOS;
            keep the soft gradient on Android with clear white alphas.
          */}
          {IS_IOS ? (
            <View style={styles.scanLineSolid} />
          ) : (
            <LinearGradient
              colors={[
                GRADIENT_WHITE_CLEAR,
                tokens.colors.white,
                tokens.colors.white,
                GRADIENT_WHITE_CLEAR,
              ]}
              locations={[0, 0.2, 0.8, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.scanLineGradient}
            />
          )}
        </Reanimated.View>
      </Reanimated.View>

      {!scanned && hintText ? (
        <Text
          {...testProps("text_align_qr")}
          style={[styles.scannerHintText, styles.guideQrHint]}
        >
          {hintText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scannerOverlayClear: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  scannerHintText: {
    color: tokens.colors.white,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  guideQrHint: {
    position: "absolute",
    left: tokens.spacing._20,
    right: tokens.spacing._20,
    bottom: "22%",
  },
  scannerFrame: {
    borderRadius: 12,
    backgroundColor: "transparent",
    overflow: "visible",
  },
  animatedQrFrame: {
    position: "absolute",
  },
  cornerMarker: {
    position: "absolute",
    width: 36,
    height: 36,
    borderColor: tokens.colors.white,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 5,
    borderLeftWidth: 5,
    borderTopLeftRadius: 14,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 5,
    borderRightWidth: 5,
    borderTopRightRadius: 14,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 5,
    borderLeftWidth: 5,
    borderBottomLeftRadius: 14,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 5,
    borderRightWidth: 5,
    borderBottomRightRadius: 14,
  },
  scanLine: {
    position: "absolute",
    height: 3,
  },
  scanLineGradient: {
    width: "100%",
    height: 3,
    borderRadius: 2,
  },
  scanLineSolid: {
    width: "100%",
    height: 3,
    borderRadius: 2,
    backgroundColor: tokens.colors.white,
    opacity: 0.9,
  },
});
