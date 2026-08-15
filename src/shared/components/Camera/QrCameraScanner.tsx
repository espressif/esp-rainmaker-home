/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  InteractionManager,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import {
  CameraView,
  type BarcodeScanningResult,
} from "expo-camera";

import { QrScanOverlay } from "@shared/components/Camera/QrScanOverlay";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import {
  CAMERA_PICTURE_SIZE_QR,
  CAMERA_TYPE_BACK,
  PLATFORM_IOS,
  QR_CAMERA_MOUNT_DELAY_ANDROID_MS,
  QR_CAMERA_MOUNT_DELAY_IOS_MS,
  QR_CAMERA_REMOUNT_GAP_MS,
} from "@shared/utils/constants";
import type { DetectedQrBounds } from "@shared/utils/qrBounds";
import { testProps } from "@shared/utils/testProps";

const IS_IOS = Platform.OS === PLATFORM_IOS;

export interface QrCameraScannerProps {
  /**
   * When true, mounts the camera after interactions + platform delay.
   * When false, tears down AVCapture immediately.
   */
  enabled: boolean;
  /**
   * Bump to force unmount → remount with a short gap (e.g. Scan Again).
   * Ignored while `enabled` is false.
   */
  remountKey?: number;
  /** When false, `onBarcodeScanned` is not attached (processing / cooldown). */
  scanningEnabled: boolean;
  facing?: "front" | "back";
  scanned: boolean;
  hasFailed?: boolean;
  detectedBounds: DetectedQrBounds | null;
  /** Idle hint under the guide frame. */
  hintText?: string | null;
  onBarcodeScanned?: (result: BarcodeScanningResult) => void;
  onOverlaySizeChange?: (width: number, height: number) => void;
  onCameraReady?: () => void;
  /** Optional chrome over the preview (e.g. flip control). */
  topAccessory?: ReactNode;
}

export type QrCameraScannerHandle = {
  /** Freezes the last preview frame without unmounting. */
  pausePreview: () => Promise<void>;
  /** Resumes a paused preview. */
  resumePreview: () => Promise<void>;
};

/**
 * Shared QR camera shell: delayed `CameraView` mount + ScanQR-style overlay.
 *
 * Parents own parse / provision / config logic; this only renders the camera UX.
 */
export const QrCameraScanner = forwardRef<
  QrCameraScannerHandle,
  QrCameraScannerProps
>(function QrCameraScanner(
  {
    enabled,
    remountKey = 0,
    scanningEnabled,
    facing = CAMERA_TYPE_BACK,
    scanned,
    hasFailed = false,
    detectedBounds,
    hintText,
    onBarcodeScanned,
    onOverlaySizeChange,
    onCameraReady,
    topAccessory,
  },
  ref,
) {
  const cameraRef = useRef<CameraView>(null);
  const prevRemountKeyRef = useRef(remountKey);
  const [isMountReady, setIsMountReady] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraInstanceKey, setCameraInstanceKey] = useState(0);

  useImperativeHandle(
    ref,
    () => ({
      pausePreview: async () => {
        try {
          await cameraRef.current?.pausePreview();
        } catch (error: unknown) {
          console.warn(
            "[QrCameraScanner] pausePreview failed:",
            error instanceof Error ? error.message : error,
          );
        }
      },
      resumePreview: async () => {
        try {
          await cameraRef.current?.resumePreview();
        } catch (error: unknown) {
          console.warn(
            "[QrCameraScanner] resumePreview failed:",
            error instanceof Error ? error.message : error,
          );
        }
      },
    }),
    [],
  );

  // Delayed mount when gates open; tear down when closed.
  useEffect(() => {
    if (!enabled) {
      setIsMountReady(false);
      setIsActive(false);
      setIsCameraReady(false);
      return;
    }

    let cancelled = false;
    let delayTimer: ReturnType<typeof setTimeout> | undefined;
    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      const delayMs = IS_IOS
        ? QR_CAMERA_MOUNT_DELAY_IOS_MS
        : QR_CAMERA_MOUNT_DELAY_ANDROID_MS;
      delayTimer = setTimeout(() => {
        if (cancelled) {
          return;
        }
        setCameraInstanceKey((key) => key + 1);
        setIsMountReady(true);
        setIsActive(true);
      }, delayMs);
    });

    return () => {
      cancelled = true;
      interactionHandle.cancel();
      if (delayTimer) {
        clearTimeout(delayTimer);
      }
    };
  }, [enabled]);

  // Scan Again / forced remount while still enabled (ignore remountKey on enable).
  useEffect(() => {
    if (!enabled) {
      prevRemountKeyRef.current = remountKey;
      return;
    }
    if (prevRemountKeyRef.current === remountKey) {
      return;
    }
    prevRemountKeyRef.current = remountKey;

    setIsCameraReady(false);
    setIsActive(false);
    const timer = setTimeout(() => {
      setCameraInstanceKey((key) => key + 1);
      setIsMountReady(true);
      setIsActive(true);
    }, QR_CAMERA_REMOUNT_GAP_MS);

    return () => clearTimeout(timer);
  }, [enabled, remountKey]);

  return (
    <View style={globalStyles.scannerContainer}>
      <View
        style={[globalStyles.scanner, styles.cameraPlaceholder]}
        {...testProps("view_camera_placeholder")}
      />
      {isMountReady && isActive ? (
        <CameraView
          key={cameraInstanceKey}
          ref={cameraRef}
          style={[globalStyles.scanner, styles.cameraLayer]}
          facing={facing}
          pictureSize={CAMERA_PICTURE_SIZE_QR}
          animateShutter={false}
          barcodeScannerSettings={{
            barcodeTypes: ["qr"],
          }}
          onCameraReady={() => {
            setIsCameraReady(true);
            onCameraReady?.();
          }}
          onBarcodeScanned={
            isCameraReady && scanningEnabled ? onBarcodeScanned : undefined
          }
        />
      ) : null}
      <QrScanOverlay
        scanned={scanned}
        detectedQrBounds={detectedBounds}
        hasFailed={hasFailed}
        hintText={hintText}
        onOverlaySizeChange={onOverlaySizeChange}
      />
      {topAccessory}
    </View>
  );
});

const styles = StyleSheet.create({
  cameraPlaceholder: {
    backgroundColor: tokens.colors.black,
  },
  cameraLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
