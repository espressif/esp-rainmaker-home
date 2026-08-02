/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// React Native Imports
import { useState, useEffect, useRef, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Vibration,
  ActivityIndicator,
} from "react-native";
// Expo Imports
import { CameraView, useCameraPermissions } from "expo-camera";

// SDK
import { ESPCDFProvisioningDevice } from "@store";

// Styles
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";

// Hooks
import { useCDF } from "@shared/hooks/useCDF";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useDevicePermissions } from "@features/provision/hooks";

// Icons
import { QrCode, Camera, CameraOff, RotateCcw } from "lucide-react-native";

// Components
import { Header, ScreenWrapper } from "@shared/components";
import {
  BLEPermissionScreen,
  BluetoothDisabledScreen,
} from "@features/provision/components";

// Utils
import { testProps } from "@shared/utils/testProps";
import { useToast } from "@shared/hooks/useToast";
import { parseRMakerCapabilities } from "@features/provision/utils/rmakerCapabilities";
import {
  connectWithTimeout,
  isConnectTimeout,
} from "@features/provision/utils/scanBLEHelper";
import { getMissingPermission, getQRScanErrorType } from "@shared/utils/device";

// Constants
import {
  MATTER_QR_CODE_PREFIX,
  QR_CODE_TYPE,
  CAMERA_TYPE_FRONT,
  CAMERA_TYPE_BACK,
  RM_QR_CODE_PREFIX,
  RM_QR_TRANSPORT_MAP,
} from "@shared/utils/constants";
import {
  MATTER_ROUTE_PARAM_FABRIC_CONVERSION_CONSENT_REQUIRED,
  MATTER_ROUTE_PARAM_VALUE_FALSE,
} from "@features/matter/constants";
import {
  getMatterUnsupportedMessage,
  isMatterCommissioningSupported,
} from "@features/matter/utils/matterSupport";

const { width, height } = Dimensions.get("window");
const SCANNER_WIDTH = width * 0.8;

/**
 * AnimatedGuide
 *
 * Displays an animated guide to help users scan QR codes
 */
const AnimatedGuide = ({ scanned }: { scanned: boolean }) => {
  const [fadeAnim] = useState(new Animated.Value(0));
  const { t } = useTranslation();

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0.3,
          duration: 1500,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, []);

  return (
    <Animated.View
      {...testProps("view_scan_qr")}
      style={[
        globalStyles.guideContainer,
        { opacity: fadeAnim, position: "absolute", top: height * 0.15 },
      ]}
    >
      <QrCode
        {...testProps("icon_qr_code")}
        size={32}
        color={tokens.colors.white}
        style={globalStyles.guideIcon}
      />
      <Text {...testProps("text_qr_guide")} style={globalStyles.guideText}>
        {scanned
          ? t("device.scan.qr.connectingToDevice")
          : t("device.scan.qr.holdSteady")}
      </Text>
    </Animated.View>
  );
};

/**
 * ScannerOverlay
 */
const ScannerOverlay = ({
  isProcessing,
  scanned,
}: {
  isProcessing: boolean;
  scanned: boolean;
}) => {
  const [animation] = useState(new Animated.Value(0));
  const animationRef = useRef<ReturnType<typeof Animated.loop> | null>(null);
  const { t } = useTranslation();

  // Start animation loop
  const startAnimation = useCallback(() => {
    // Stop any existing animation
    if (animationRef.current) {
      animationRef.current.stop();
    }
    // Reset animation value
    animation.setValue(0);
    // Start new animation loop - up to down, then down to up
    animationRef.current = Animated.loop(
      Animated.sequence([
        // Move from top to bottom (0 to 1)
        Animated.timing(animation, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        // Move from bottom to top (1 to 0)
        Animated.timing(animation, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]),
    );
    animationRef.current.start();
  }, [animation]);

  // Start animation on mount
  useEffect(() => {
    startAnimation();
    return () => {
      // Cleanup animation on unmount
      if (animationRef.current) {
        animationRef.current.stop();
      }
    };
  }, [startAnimation]);

  // Restart animation when scanning restarts (scanned changes from true to false)
  const prevScannedRef = useRef(scanned);
  useEffect(() => {
    // If scanned changed from true to false, restart animation
    if (prevScannedRef.current === true && scanned === false) {
      startAnimation();
    }
    prevScannedRef.current = scanned;
  }, [scanned, startAnimation]);

  return (
    <View
      {...testProps("view_scanner_overlay")}
      style={globalStyles.scannerOverlay}
    >
      <View
        {...testProps("view_scanner_frame_container")}
        style={globalStyles.scannerFrameContainer}
      >
        <View {...testProps("view_scanner_frame")} style={styles.scannerFrame}>
          {/* Corner markers */}
          <View
            {...testProps("view_corner_top_left")}
            style={[styles.cornerMarker, styles.topLeft]}
          />
          <View
            {...testProps("view_corner_top_right")}
            style={[styles.cornerMarker, styles.topRight]}
          />
          <View
            {...testProps("view_corner_bottom_left")}
            style={[styles.cornerMarker, styles.bottomLeft]}
          />
          <View
            {...testProps("view_corner_bottom_right")}
            style={[styles.cornerMarker, styles.bottomRight]}
          />

          {isProcessing ? (
            <View
              {...testProps("view_scan_processing")}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <ActivityIndicator size={70} color="#1875D6" />
            </View>
          ) : (
            <Animated.View
              {...testProps("view_scan_line")}
              style={[
                styles.scanLine,
                {
                  transform: [
                    {
                      translateY: animation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, SCANNER_WIDTH],
                      }),
                    },
                  ],
                },
              ]}
            />
          )}
        </View>
        <Text {...testProps("text_align_qr")} style={globalStyles.scannerText}>
          {t("device.scan.qr.alignQRCode")}
        </Text>
      </View>
      <AnimatedGuide scanned={scanned} />
    </View>
  );
};

/**
 * CameraPermissionScreen
 */
const CameraPermissionScreen = ({
  status,
  onRequestPermission,
}: {
  status: "requesting" | "denied";
  onRequestPermission: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <View
      {...testProps("view_permission_screen")}
      style={[globalStyles.container, globalStyles.itemCenter]}
    >
      <View
        {...testProps("view_permission_content")}
        style={[globalStyles.permissionContent]}
      >
        <View
          {...testProps("view_permission_icon")}
          style={globalStyles.permissionIconContainer}
        >
          <CameraOff size={40} color={tokens.colors.gray} />
        </View>
        <Text
          {...testProps("text_permission_title_scan_qr")}
          style={[globalStyles.heading, globalStyles.permissionTitle]}
        >
          {status === "requesting"
            ? t("device.scan.qr.requestingPermission")
            : t("device.scan.qr.noCameraPermission")}
        </Text>
        <Text
          {...testProps("text_permission_msg_scan_qr")}
          style={[globalStyles.textGray, globalStyles.permissionDescription]}
        >
          {t("device.scan.qr.cameraPermissionRequired")}
        </Text>
        {status === "denied" && (
          <TouchableOpacity
            {...testProps("button_permission")}
            style={[
              globalStyles.actionButton,
              globalStyles.actionButtonPrimary,
              globalStyles.permissionButton,
            ]}
            onPress={onRequestPermission}
          >
            <Camera
              size={20}
              color={tokens.colors.white}
              style={styles.buttonIcon}
            />
            <Text
              {...testProps("text_grant_permission_scan_qr")}
              style={globalStyles.actionButtonTextPrimary}
            >
              {t("device.scan.qr.grantPermission")}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

/**
 * ScanQR
 */
const ScanQR = () => {
  const toast = useToast();
  const { store } = useCDF();
  const router = useRouter();
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const {
    bleGranted,
    locationGranted,
    bluetoothEnabled,
    isChecking: isCheckingBluetooth,
    allPermissionsGranted,
    requestPermissions: requestBluetoothPermissions,
    checkPermissions: checkBluetoothPermissions,
  } = useDevicePermissions();
  const [scanned, setScanned] = useState(false);
  const scannedRef = useRef(false);
  const [cameraType, setCameraType] = useState<"front" | "back">(
    CAMERA_TYPE_BACK,
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [showScanAgain, setShowScanAgain] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const cameraRef = useRef<CameraView>(null);

  const user = store?.userStore?.user;

  const toggleCamera = () => {
    setCameraType((prev) =>
      prev === CAMERA_TYPE_FRONT ? CAMERA_TYPE_BACK : CAMERA_TYPE_FRONT,
    );
  };

  /**
   * Unmounts `CameraView` to release the native preview (expo-camera recommended teardown).
   * expo-camera exposes `onCameraReady` on start only — no awaitable release callback.
   */
  const deactivateCamera = useCallback(() => {
    setIsCameraActive(false);
    setIsCameraReady(false);
  }, []);

  /**
   * Clears scan locks that block `onBarcodeScanned` and the Scan Again control.
   * Does not disconnect the provisioned device in the store.
   */
  const clearScanLocks = useCallback(() => {
    setIsProcessing(false);
    setScanned(false);
    scannedRef.current = false;
  }, []);

  /**
   * Remounts the camera preview so barcode detection can resume after a reset.
   */
  const remountCamera = useCallback(() => {
    setIsCameraActive(true);
    setIsCameraReady(false);
    setCameraKey((key) => key + 1);
  }, []);

  /**
   * Re-enables live scanning when the screen regains focus after navigation away.
   */
  const prepareScannerOnFocus = useCallback(() => {
    clearScanLocks();
    setShowScanAgain(false);
    remountCamera();
  }, [clearScanLocks, remountCamera]);

  /**
   * Reset the scanning state and UI after errors or when prompting rescan.
   */
  const resetScanState = useCallback(() => {
    clearScanLocks();
    setShowScanAgain(true);
    remountCamera();
  }, [clearScanLocks, remountCamera]);

  /**
   * Handle scan again - reset state and disconnect device if connected
   */
  const handleScanAgain = () => {
    resetScanState();
    setShowScanAgain(false);
    const device = store?.nodeStore?.connectedDevice;

    if (device) {
      device.disconnect();
      store.nodeStore.connectedDevice = null;
    }
  };

  /**
   * Handle invalid QR code cases
   */
  const handleInvalidQRCode = () => {
    toast.showError(t("device.scan.qr.invalidQRCode"));
    setTimeout(() => {
      resetScanState();
    }, 2000);
  };

  /**
   * Navigate to WiFi setup screen
   */
  const navigateToWifi = () => {
    router.push({ pathname: "/(provision)/Wifi" });
  };

  /**
   * Handle QR code provisioning logic
   */
  const handleQRProvisioning = async (
    espDevice: ESPCDFProvisioningDevice,
    pop: string,
  ) => {
    // Fetch version info and prov capabilities
    let versionInfo: any;
    let provCapabilities: string[];

    try {
      versionInfo = await espDevice.getDeviceVersionInfo();
    } catch (error: any) {
      console.error(
        "[QR Provisioning] Error fetching version info:",
        error?.message,
      );
      throw error;
    }

    try {
      provCapabilities = await espDevice.getDeviceCapabilities();
    } catch (error: any) {
      console.error(
        "[QR Provisioning] Error fetching capabilities:",
        error?.message,
      );
      throw error;
    }

    // Parse RMaker capabilities from version info
    // This determines if device supports assisted claiming (claim)
    const rmakerCaps = parseRMakerCapabilities(versionInfo, provCapabilities);

    // Check if device needs PoP
    if (rmakerCaps.requiresPop && pop) {
      try {
        const popSet = await espDevice.setProofOfPossession(pop);
        if (!popSet) {
          resetScanState();
          return toast.showError(t("device.scan.qr.invalidQRCode"));
        }
      } catch (error: any) {
        console.error("[QR Provisioning] POP set error:", error?.message);
        resetScanState();
        return toast.showError(t("device.scan.qr.invalidQRCode"));
      }
    } else if (rmakerCaps.requiresPop && !pop) {
      // If POP is required but not provided in QR code, navigate to POP screen
      deactivateCamera();
      router.push({
        pathname: "/(provision)/POP",
        params: {
          hasClaimCap: rmakerCaps.hasClaim ? "true" : "false",
          hasCameraClaim: rmakerCaps.hasCameraClaim ? "true" : "false",
        },
      });
      return;
    }

    // Initialize session
    try {
      const isSessionInitialized = await espDevice.initializeSession();
      if (!isSessionInitialized) {
        resetScanState();
        return toast.showError(t("device.scan.qr.sessionInitFailed"));
      }
    } catch (error: any) {
      console.error("[QR Provisioning] Session init error:", error?.message);
      throw error;
    }

    // If device supports claiming, navigate to Claiming screen
    // This is determined by rmaker.cap array containing "claim" or "camera_claim"
    if (rmakerCaps.hasClaim) {
      deactivateCamera();
      router.push({
        pathname: "/(provision)/Claiming",
        params: {
          isCameraDevice: rmakerCaps.hasCameraClaim ? "true" : "false",
        },
      });
      return;
    }

    deactivateCamera();
    navigateToWifi();
  };

  /**
   * Utility function to handle QR scan errors
   * Uses a switch statement to categorize and handle different error types
   * @param errorMessage - The error message to analyze
   * @param t - Translation function
   * @param toast - Toast notification utility
   * @param resetScanState - Function to reset scan state
   */
  const handleQRScanError = useCallback(
    (
      errorMessage: string,
      t: (key: string, params?: Record<string, string>) => string,
      toast: ReturnType<typeof useToast>,
      resetScanState: () => void,
    ) => {
      // Determine error type based on error message content
      const errorType = getQRScanErrorType(errorMessage);

      // Handle error based on type using switch statement
      switch (errorType) {
        case "permission": {
          // Request permissions using hook method
          requestBluetoothPermissions();
          toast.showError(t("device.scan.qr.bluetoothPermissionRequired"));
          // Wait a bit then check if permission was granted and restart scan
          setTimeout(async () => {
            await checkBluetoothPermissions();
            // Reset state regardless of permission status to show scan again button
            resetScanState();
          }, 1500);
          break;
        }
        case "bluetoothDisabled": {
          // Show Bluetooth disabled error
          toast.showError(t("device.scan.qr.bluetoothDisabled"));
          resetScanState();
          break;
        }
        case "connection": {
          // Show connection error
          toast.showError(t("device.scan.qr.unableToConnectToDevice"));
          resetScanState();
          break;
        }
        case "session": {
          // Show session initialization error
          toast.showError(t("device.scan.qr.sessionInitFailed"));
          resetScanState();
          break;
        }
        case "generic":
        default: {
          // Generic error - but first check if BLE is actually disabled or permissions missing
          // This handles cases where error message doesn't clearly indicate BLE issue
          (async () => {
            await checkBluetoothPermissions();
            // Wait a bit for state to update, then check hook values
            setTimeout(() => {
              // Use hook values after state update
              // Note: These values might be slightly stale, but will be updated on next render
              if (bluetoothEnabled === false) {
                toast.showError(t("device.scan.qr.bluetoothDisabled"));
              } else if (!allPermissionsGranted) {
                toast.showError(
                  t("device.scan.qr.bluetoothPermissionRequired"),
                );
              } else {
                toast.showError(t("device.scan.qr.invalidQRCode"));
              }
              resetScanState();
            }, 200);
          })();
          break;
        }
      }
    },
    [
      checkBluetoothPermissions,
      requestBluetoothPermissions,
      bluetoothEnabled,
      allPermissionsGranted,
    ],
  );

  /**
   * Handle Matter QR code commissioning
   */
  const handleMatterCommissioning = async (qrData: string) => {
    try {
      if (!isMatterCommissioningSupported()) {
        toast.showError(getMatterUnsupportedMessage(t));
        return resetScanState();
      }

      // Check if user is authenticated
      if (!user) {
        toast.showError(t("device.scan.qr.matterAuthRequired"));
        return resetScanState();
      }

      deactivateCamera();
      router.push({
        pathname: "/(matter)/Commissioning",
        params: {
          qrData,
          [MATTER_ROUTE_PARAM_FABRIC_CONVERSION_CONSENT_REQUIRED]:
            MATTER_ROUTE_PARAM_VALUE_FALSE,
        },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      toast.showError(
        t("device.scan.qr.matterCommissioningFailed", { error: errorMessage }),
      );
      resetScanState();
    }
  };

  const handleRMNodeTranformt = (qrData: string) => {
    const firstColon = qrData.indexOf(":");
    const type = firstColon >= 0 ? qrData.slice(0, firstColon).trim() : "";
    const payload =
      firstColon >= 0 ? qrData.slice(firstColon + 1).trim() : qrData.trim();

    if (!payload.includes("|")) {
      return null;
    }

    const [name, pop, transport] = payload
      .split("|")
      .map((part: string) => part.trim());

    return {
      type,
      name,
      pop,
      transport:
        RM_QR_TRANSPORT_MAP[transport as keyof typeof RM_QR_TRANSPORT_MAP],
    };
  };

  /**
   * Handle device provisioning process
   */
  const handleDeviceProvision = async (qrData: any) => {
    // Check BLE permissions and state before attempting connection
    // Refresh permissions state to ensure we have the latest values
    await checkBluetoothPermissions();

    // If BLE permissions are not granted, show error and return
    if (!allPermissionsGranted) {
      requestBluetoothPermissions();
      toast.showError(t("device.scan.qr.bluetoothPermissionRequired"));
      resetScanState();
      return;
    }

    // If Bluetooth is disabled, show error and return
    if (bluetoothEnabled === false) {
      toast.showError(t("device.scan.qr.bluetoothDisabled"));
      resetScanState();
      return;
    }

    // Extract and set default values
    let { security = 2, name, pop, transport } = qrData;

    // Create provisioning device
    const cdfDevice = await user?.createProvisioningDevice(
      name,
      transport,
      security,
      pop,
    );

    if (!cdfDevice?.name) {
      resetScanState();
      return toast.showError(t("device.scan.qr.failedToInitializeDevice"));
    }

    const connected = await connectWithTimeout(cdfDevice);

    if (!connected) {
      resetScanState();
      return toast.showError(t("device.scan.qr.unableToConnectToDevice"));
    }

    // Store connected device (with advertisement data for AI Agent detection on Wifi screen)
    store.nodeStore.connectedDevice = cdfDevice;

    // Handle QR provisioning (same flow for both iOS and Android)
    await handleQRProvisioning(cdfDevice, pop);
  };

  /**
   * Main handler for barcode scanning
   */
  const handleScannedQRCode = async (result: any) => {
    // Prevent multiple scans
    if (scanned || scannedRef.current) return;
    let qrData: any;
    scannedRef.current = true;
    setScanned(true);

    // Validate QR code
    if (result.type !== QR_CODE_TYPE || !result.data) {
      return handleInvalidQRCode();
    }

    // Check if it's a Matter QR code
    if (result.data.startsWith(MATTER_QR_CODE_PREFIX)) {
      setIsProcessing(true);
      deactivateCamera();
      Vibration.vibrate(200);

      try {
        await handleMatterCommissioning(result.data);
      } catch {
        toast.showError(t("device.scan.qr.matterCommissioningFailed"));
        resetScanState();
      }
      return;
    } else if (result.data.startsWith(RM_QR_CODE_PREFIX)) {
      qrData = handleRMNodeTranformt(result.data);
      if (!qrData?.name || !qrData?.transport) {
        return handleInvalidQRCode();
      }
    } else {
      // Parse and validate ESP provisioning QR data
      try {
        qrData = JSON.parse(result.data);
        if (typeof qrData !== "object") throw new Error("Invalid QR");
      } catch {
        return handleInvalidQRCode();
      }
    }

    setIsProcessing(true);
    deactivateCamera();
    Vibration.vibrate(200);

    try {
      await handleDeviceProvision(qrData);
    } catch (error: unknown) {
      console.error("[QR Scan] Provisioning error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      if (isConnectTimeout(error)) {
        toast.showError(t("device.scan.qr.unableToConnectToDevice"));
        resetScanState();
        return;
      }

      handleQRScanError(errorMessage, t, toast, resetScanState);
    }
  };

  // Re-check Bluetooth state periodically when it's disabled
  useEffect(() => {
    if (bluetoothEnabled === false && !isCheckingBluetooth) {
      const interval = setInterval(() => {
        checkBluetoothPermissions();
      }, 3000); // Check every 3 seconds to reduce re-renders
      return () => clearInterval(interval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, [bluetoothEnabled, isCheckingBluetooth]);

  // Fresh scanner on focus; release camera on blur (keeps store connectedDevice intact)
  useFocusEffect(
    useCallback(() => {
      prepareScannerOnFocus();
      return () => deactivateCamera();
    }, [prepareScannerOnFocus, deactivateCamera]),
  );

  return (
    <ScreenWrapper
      style={{ ...globalStyles.screenWrapper, padding: 0 }}
      qaId="screen_wrapper_scan_qr"
    >
      <Header
        label={t("device.scan.qr.title")}
        rightSlot={
          <QrCode
            {...testProps("icon_qr_code")}
            size={24}
            color={tokens.colors.primary}
          />
        }
        qaId="header_scan_qr"
      />

      <View {...testProps("view_scan_qr_container")} style={styles.container}>
        <View {...testProps("view_scan_qr_content")} style={styles.content}>
          {!permission ? (
            <CameraPermissionScreen
              status="requesting"
              onRequestPermission={requestPermission}
            />
          ) : !permission.granted ? (
            <CameraPermissionScreen
              status="denied"
              onRequestPermission={requestPermission}
            />
          ) : !allPermissionsGranted ? (
            <BLEPermissionScreen
              status={isCheckingBluetooth ? "requesting" : "denied"}
              missingPermission={getMissingPermission(
                bleGranted,
                locationGranted,
              )}
              testIdPrefix="scan_qr"
            />
          ) : bluetoothEnabled === false && !isCheckingBluetooth ? (
            <BluetoothDisabledScreen />
          ) : (
            <View style={globalStyles.scannerContainer}>
              <View
                style={[globalStyles.scanner, styles.cameraPlaceholder]}
                {...testProps("view_camera_placeholder")}
              />
              {isCameraActive ? (
                <CameraView
                  key={cameraKey}
                  ref={cameraRef}
                  style={[globalStyles.scanner, styles.cameraLayer]}
                  facing={cameraType}
                  barcodeScannerSettings={{
                    barcodeTypes: ["qr"],
                  }}
                  onCameraReady={() => setIsCameraReady(true)}
                  onBarcodeScanned={
                    isCameraReady && !isProcessing
                      ? handleScannedQRCode
                      : undefined
                  }
                />
              ) : null}
              <ScannerOverlay isProcessing={isProcessing} scanned={scanned} />

              <View
                {...testProps("view_camera_controls")}
                style={globalStyles.cameraControlsContainer}
              >
                <TouchableOpacity
                  {...testProps("button_camera_toggle")}
                  style={globalStyles.cameraToggle}
                  onPress={toggleCamera}
                  disabled={isProcessing}
                >
                  <RotateCcw size={24} color={tokens.colors.white} />
                </TouchableOpacity>

                {(scanned || showScanAgain) && (
                  <TouchableOpacity
                    {...testProps("button_rescan")}
                    style={[
                      globalStyles.actionButton,
                      globalStyles.actionButtonPrimary,
                      globalStyles.scanAgainButton,
                      isProcessing && styles.buttonDisabled,
                    ]}
                    onPress={handleScanAgain}
                    disabled={isProcessing}
                  >
                    <QrCode
                      {...testProps("icon_button")}
                      size={20}
                      color={tokens.colors.white}
                      style={styles.buttonIcon}
                    />
                    <Text
                      {...testProps("text_scan_again")}
                      style={globalStyles.actionButtonTextPrimary}
                    >
                      {t("device.scan.qr.scanAgain")}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.black,
  },
  content: {
    flex: 1,
  },
  header: {
    backgroundColor: "transparent",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  buttonIcon: {
    marginRight: tokens.spacing._10,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
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
  scannerFrame: {
    width: SCANNER_WIDTH,
    height: SCANNER_WIDTH,
    borderRadius: 24,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  cornerMarker: {
    position: "absolute",
    width: 24,
    height: 24,
    borderColor: tokens.colors.primary,
  },
  topLeft: {
    top: 10,
    left: 10,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 12,
  },
  topRight: {
    top: 10,
    right: 10,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 12,
  },
  bottomLeft: {
    bottom: 10,
    left: 10,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 12,
  },
  bottomRight: {
    bottom: 10,
    right: 10,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 12,
  },
  scanLine: {
    width: SCANNER_WIDTH,
    height: 2,
    backgroundColor: tokens.colors.primary,
    shadowColor: tokens.colors.primary,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.5,
    shadowRadius: 5,
    elevation: 3,
  },
});

export default ScanQR;
