/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef, useState } from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import type { BarcodeScanningResult } from "expo-camera";
import { useTranslation } from "react-i18next";
import { SwitchCamera } from "lucide-react-native";

import {
  ScreenWrapper,
  Header,
  QrCameraScanner,
  type QrCameraScannerHandle,
} from "@shared/components";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";
import {
  CAMERA_TYPE_BACK,
  CAMERA_TYPE_FRONT,
} from "@shared/utils/constants";
import {
  getCenteredGuideBounds,
  mapBarcodeToOverlayBounds,
  type DetectedQrBounds,
} from "@shared/utils/qrBounds";
import { testProps } from "@shared/utils/testProps";
import { CONFIG_QR_LOCK_MS } from "@features/config/constants";
import { ConfigScanFooter } from "./ConfigScanFooter";

const { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } = Dimensions.get("window");

export interface ConfigScanScannerViewProps {
  title: string;
  /**
   * Resolves / applies the scanned payload.
   * @returns `true` when accepted (parent leaves the scanner); `false` when
   * invalid / failed so this view can freeze, show red border, and Scan Again.
   * A rejected promise is treated the same as `false`.
   */
  onScan: (data: string) => Promise<boolean>;
  onBack: () => void;
}

/**
 * Config QR scanner — same shared camera shell / overlay as provision ScanQR.
 * Invalid payloads freeze the preview, vibrate, show a red lock border, and
 * offer Scan Again at the bottom.
 */
export function ConfigScanScannerView({
  title,
  onScan,
  onBack,
}: ConfigScanScannerViewProps) {
  const { t } = useTranslation();
  const cameraRef = useRef<QrCameraScannerHandle>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [facing, setFacing] = useState<"front" | "back">(CAMERA_TYPE_BACK);
  const [scanned, setScanned] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const [showScanAgain, setShowScanAgain] = useState(false);
  const [remountKey, setRemountKey] = useState(0);
  const [detectedBounds, setDetectedBounds] =
    useState<DetectedQrBounds | null>(null);
  const overlaySizeRef = useRef({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
  });
  const scannedRef = useRef(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => {
        setIsFocused(false);
        if (lockTimerRef.current) {
          clearTimeout(lockTimerRef.current);
          lockTimerRef.current = null;
        }
      };
    }, []),
  );

  /**
   * Toggles front / back camera facing.
   */
  const toggleCamera = useCallback(() => {
    setFacing((prev) =>
      prev === CAMERA_TYPE_FRONT ? CAMERA_TYPE_BACK : CAMERA_TYPE_FRONT,
    );
  }, []);

  /**
   * Freezes the camera preview immediately (best-effort).
   */
  const pauseCamera = useCallback(async () => {
    try {
      await cameraRef.current?.pausePreview();
    } catch (error: unknown) {
      console.warn(
        "[ConfigScan] pausePreview failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }, []);

  /**
   * Unfreezes the camera preview immediately (best-effort).
   */
  const resumeCamera = useCallback(async () => {
    try {
      await cameraRef.current?.resumePreview();
    } catch (error: unknown) {
      console.warn(
        "[ConfigScan] resumePreview failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }, []);

  /**
   * Clears scan locks and remounts the camera after an invalid QR (Scan Again).
   * Resume is best-effort; unlock and remount always run so Scan Again cannot stick.
   */
  const handleScanAgain = useCallback(() => {
    void (async () => {
      await resumeCamera();
      scannedRef.current = false;
      setScanned(false);
      setHasFailed(false);
      setShowScanAgain(false);
      setDetectedBounds(null);
      setRemountKey((key) => key + 1);
    })();
  }, [resumeCamera]);

  /**
   * Vibrates, paints the red failure border, and shows Scan Again — same
   * invalid-QR UX as provision ScanQR. Preview is already paused on hit.
   */
  const markInvalidScan = useCallback(async () => {
    Vibration.vibrate(200);
    await pauseCamera();
    setHasFailed(true);
    setShowScanAgain(true);
  }, [pauseCamera]);

  /**
   * Locks the overlay on the detected QR, freezes the preview, then hands data
   * to the config flow. On failure, keeps the frozen frame with a red border
   * and Scan Again.
   * @param result - Expo barcode scan payload
   */
  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (scannedRef.current || !result.data) {
        return;
      }
      scannedRef.current = true;
      setScanned(true);
      setHasFailed(false);
      setShowScanAgain(false);

      const { width: ow, height: oh } = overlaySizeRef.current;
      const bounds =
        mapBarcodeToOverlayBounds(result, ow, oh) ??
        getCenteredGuideBounds(ow, oh, WINDOW_WIDTH);
      setDetectedBounds(bounds);

      // Freeze as soon as we lock onto a code (invalid path keeps this frame).
      void pauseCamera();

      lockTimerRef.current = setTimeout(() => {
        lockTimerRef.current = null;
        void (async () => {
          try {
            const accepted = await onScan(result.data);
            if (!accepted) {
              await markInvalidScan();
            }
          } catch {
            await markInvalidScan();
          }
        })();
      }, CONFIG_QR_LOCK_MS);
    },
    [markInvalidScan, onScan, pauseCamera],
  );

  return (
    <ScreenWrapper style={globalStyles.configScanContainerNoPadding}>
      <Header label={title} showBack onBackPress={onBack} />
      <View style={styles.container}>
        <QrCameraScanner
          ref={cameraRef}
          enabled={isFocused}
          remountKey={remountKey}
          scanningEnabled={!scanned && !showScanAgain}
          facing={facing}
          scanned={scanned}
          hasFailed={hasFailed}
          detectedBounds={detectedBounds}
          hintText={t("config.scan.scanOverlay")}
          onBarcodeScanned={handleBarcodeScanned}
          onOverlaySizeChange={(ow, oh) => {
            overlaySizeRef.current = { width: ow, height: oh };
          }}
          topAccessory={
            !scanned && !showScanAgain ? (
              <View
                {...testProps("view_config_camera_flip_controls")}
                style={styles.cameraFlipTopBar}
                pointerEvents="box-none"
              >
                <TouchableOpacity
                  {...testProps("button_config_camera_toggle")}
                  style={styles.cameraFlipButton}
                  onPress={toggleCamera}
                >
                  <SwitchCamera
                    {...testProps("icon_config_camera_flip")}
                    size={22}
                    color={tokens.colors.white}
                  />
                  <Text
                    {...testProps("text_config_camera_flip")}
                    style={styles.cameraFlipLabel}
                  >
                    {t("device.scan.qr.flipCamera")}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
        <ConfigScanFooter
          showScanAgain={showScanAgain}
          onScanAgain={handleScanAgain}
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.black,
  },
  cameraFlipTopBar: {
    position: "absolute",
    top: tokens.spacing._15,
    right: tokens.spacing._15,
    zIndex: 20,
  },
  cameraFlipButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: tokens.spacing._10,
    paddingHorizontal: tokens.spacing._10,
    borderRadius: tokens.radius.md,
    backgroundColor: "rgba(0,0,0,0.5)",
    minWidth: 56,
    gap: tokens.spacing._5,
  },
  cameraFlipLabel: {
    color: tokens.colors.white,
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.medium,
  },
});
