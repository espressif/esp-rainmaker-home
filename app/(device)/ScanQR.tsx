/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
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
  Image,
} from "react-native";
// Expo Imports
import { CameraView, useCameraPermissions } from "expo-camera";

// SDK
import { ESPDevice } from "@espressif/rainmaker-base-sdk";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Hooks
import { useCDF } from "@/hooks/useCDF";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useDevicePermissions } from "@/hooks/useDevicePermissions";

// Icons
import { QrCode, Camera, CameraOff, RotateCcw } from "lucide-react-native";

// Components
import { Header, ScreenWrapper, BluetoothDisabledScreen, BLEPermissionScreen } from "@/components";

// adapters
import { provisionAdapter } from "@/adaptors/implementations/ESPProvAdapter";

// Utils
import { testProps } from "@/utils/testProps";
import { useToast } from "@/hooks/useToast";
import { parseRMakerCapabilities } from "@/utils/rmakerCapabilities";
import { getMissingPermission, getQRScanErrorType } from "@/utils/device";

// Constants
import {
  MATTER_QR_CODE_PREFIX,
  QR_CODE_TYPE,
  CAMERA_TYPE_FRONT,
  CAMERA_TYPE_BACK,
} from "@/utils/constants";

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
      ])
    ).start();
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
        {scanned ? t("device.scan.qr.connectingToDevice") : t("device.scan.qr.holdSteady")}
      </Text>
    </Animated.View>
  );
};

/**
 * ScannerOverlay
 */
const ScannerOverlay = ({ isProcessing, scanned }: { isProcessing: boolean, scanned: boolean }) => {
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
      ])
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
    <View {...testProps("view_scanner_overlay")} style={globalStyles.scannerOverlay}>
      <View {...testProps("view_scanner_frame_container")} style={globalStyles.scannerFrameContainer}>
        <View {...testProps("view_scanner_frame")} style={styles.scannerFrame}>
          {/* Corner markers */}
          <View {...testProps("view_corner_top_left")} style={[styles.cornerMarker, styles.topLeft]} />
          <View {...testProps("view_corner_top_right")} style={[styles.cornerMarker, styles.topRight]} />
          <View {...testProps("view_corner_bottom_left")} style={[styles.cornerMarker, styles.bottomLeft]} />
          <View {...testProps("view_corner_bottom_right")} style={[styles.cornerMarker, styles.bottomRight]} />

          {isProcessing ? (
            <ActivityIndicator
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
              size={70}
              color="#1875D6"
            />
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
      style={[
        globalStyles.container,
        globalStyles.itemCenter,
      ]}
    >
      <View
        {...testProps("view_permission_content")}
        style={[
          globalStyles.permissionContent,
        ]}
      >
        <View {...testProps("view_permission_icon")} style={globalStyles.permissionIconContainer}>
          <CameraOff size={40} color={tokens.colors.gray} />
        </View>
        <Text {...testProps("text_permission_title_scan_qr")} style={[globalStyles.heading, globalStyles.permissionTitle]}>
          {status === "requesting"
            ? t("device.scan.qr.requestingPermission")
            : t("device.scan.qr.noCameraPermission")}
        </Text>
        <Text
          {...testProps("text_permission_msg_scan_qr_")}
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
            <Text {...testProps("text_grant_permission_scan_qr")} style={globalStyles.actionButtonTextPrimary}>
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
  const { store, esprmUser } = useCDF();
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
    CAMERA_TYPE_BACK
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [showScanAgain, setShowScanAgain] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  const toggleCamera = () => {
    setCameraType((prev) =>
      prev === CAMERA_TYPE_FRONT ? CAMERA_TYPE_BACK : CAMERA_TYPE_FRONT
    );
  };

  /**
   * Capture preview image before closing camera
   */
  const capturePreviewImage = useCallback(async () => {
    try {
      const camera = cameraRef.current;
      if (camera && isCameraActive) {
        const photo = await camera.takePictureAsync({
          quality: 0.5, // Lower quality for faster capture
          skipProcessing: true, // Skip processing for faster capture
        });
        if (photo?.uri) {
          setPreviewImageUri(photo.uri);
        }
      }
    } catch (error) {
      console.error("[QR Scan] Error capturing preview image:", error);
      // If capture fails, just continue without preview image
    }
  }, [isCameraActive]);

  /**
   * Close camera with preview image capture
   */
  const closeCamera = useCallback(async () => {
    // Capture preview image before closing
    await capturePreviewImage();
    // Small delay to ensure image is captured before closing
    setTimeout(() => {
      setIsCameraActive(false);
    }, 100);
  }, [capturePreviewImage]);

  /**
   * Reset the scanning state and UI
   */
  const resetScanState = () => {
    setIsProcessing(false);
    setScanned(false);
    scannedRef.current = false;
    // Show scan again button after reset
    setShowScanAgain(true);
    // Clear preview image and re-enable camera
    setPreviewImageUri(null);
    setIsCameraActive(true);
  };

  /**
   * Handle scan again - reset state and disconnect device if connected
   */
  const handleScanAgain = () => {
    resetScanState();
    setShowScanAgain(false);
    const device = store.nodeStore.connectedDevice;

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
    router.push({ pathname: "/(device)/Wifi" });
  };

  /**
   * Handle QR code provisioning logic
   */
  const handleQRProvisioning = async (espDevice: ESPDevice, pop: string) => {
    // Fetch version info and prov capabilities
    let versionInfo: any;
    let provCapabilities: string[];

    try {
      versionInfo = await espDevice.getDeviceVersionInfo();
    } catch (error: any) {
      console.error(
        "[QR Provisioning] Error fetching version info:",
        error?.message
      );
      throw error;
    }

    try {
      provCapabilities = await espDevice.getDeviceCapabilities();
    } catch (error: any) {
      console.error(
        "[QR Provisioning] Error fetching capabilities:",
        error?.message
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
          return toast.showError(t("device.scan.qr.invalidQRCode"));
        }
      } catch (error: any) {
        console.error("[QR Provisioning] POP set error:", error?.message);
        return toast.showError(t("device.scan.qr.invalidQRCode"));
      }
    } else if (rmakerCaps.requiresPop && !pop) {
      // If POP is required but not provided in QR code, navigate to POP screen
      // Close camera with preview before navigation
      await closeCamera();
      router.push({
        pathname: "/(device)/POP",
        params: {
          hasClaimCap: rmakerCaps.hasClaim ? "true" : "false",
        },
      });
      return;
    }

    // Initialize session
    try {
      const isSessionInitialized = await espDevice.initializeSession();
      if (!isSessionInitialized) {
        return toast.showError(t("device.scan.qr.sessionInitFailed"));
      }
    } catch (error: any) {
      console.error("[QR Provisioning] Session init error:", error?.message);
      throw error;
    }

    // If device supports claiming, navigate to Claiming screen
    // This is determined by rmaker.cap array containing "claim"
    if (rmakerCaps.hasClaim) {
      // Close camera with preview before navigation
      await closeCamera();
      router.push({
        pathname: "/(device)/Claiming",
      });
      return;
    }

    // Close camera with preview before navigation to WiFi screen
    await closeCamera();
    navigateToWifi();
  };


  /**
   * Utility function to handle QR scan errors
   * Uses a switch statement to categorize and handle different error types
   *
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
      resetScanState: () => void
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
                toast.showError(t("device.scan.qr.bluetoothPermissionRequired"));
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
    [checkBluetoothPermissions, requestBluetoothPermissions, bluetoothEnabled, allPermissionsGranted]
  );

  /**
   * Handle Matter QR code commissioning
   */
  const handleMatterCommissioning = async (qrData: string) => {
    try {
      setIsProcessing(true);

      // Check if user is authenticated
      if (!esprmUser) {
        toast.showError(t("device.scan.qr.matterAuthRequired"));
        return resetScanState();
      }

      // Close camera with preview before navigation
      await closeCamera();
      // Navigate to Fabric Selection with QR data
      router.push({
        pathname: "/(matter)/FabricSelection",
        params: { qrData },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      toast.showError(
        t("device.scan.qr.matterCommissioningFailed", { error: errorMessage })
      );
      resetScanState();
    }
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

    // Create ESP device
    const deviceInterface = await provisionAdapter.createESPDevice(
      name,
      transport,
      security,
      pop
    );

    if (!deviceInterface?.name) {
      return toast.showError(t("device.scan.qr.failedToInitializeDevice"));
    }

    // Create and connect device
    const espDevice = new ESPDevice(deviceInterface);
    const connectResponse = await espDevice.connect();

    if (connectResponse !== 0) {
      return toast.showError(t("device.scan.qr.unableToConnectToDevice"));
    }

    // Copy advertisement data from deviceInterface to espDevice for AI Agent detection
    if (deviceInterface.advertisementData) {
      (espDevice as any).advertisementData = deviceInterface.advertisementData;
    }

    // Store connected device (with advertisement data for AI Agent detection on Wifi screen)
    store.nodeStore.connectedDevice = espDevice;

    // Handle QR provisioning (same flow for both iOS and Android)
    await handleQRProvisioning(espDevice, pop);
  };

  /**
   * Main handler for barcode scanning
   */
  const handleBarCodeScanned = async (result: any) => {
    // Prevent multiple scans
    if (scanned || scannedRef.current) return;

    scannedRef.current = true;
    setScanned(true);

    // Validate QR code
    if (result.type !== QR_CODE_TYPE || !result.data) {
      return handleInvalidQRCode();
    }

    // Check if it's a Matter QR code
    if (result.data.startsWith(MATTER_QR_CODE_PREFIX)) {
      setIsProcessing(true);
      // Close camera with preview when processing
      await closeCamera();
      Vibration.vibrate(200);

      // Process Matter QR code with delay for better UX
      setTimeout(async () => {
        try {
          await handleMatterCommissioning(result.data);
        } catch (error) {
          toast.showError(t("device.scan.qr.matterCommissioningFailed"));
        } finally {
          resetScanState();
        }
      }, 1000);
      return;
    }

    // Parse and validate ESP provisioning QR data
    let qrData: any;
    try {
      qrData = JSON.parse(result.data);
      if (typeof qrData !== "object") throw new Error("Invalid QR");
    } catch {
      return handleInvalidQRCode();
    }

    // Start processing
    setIsProcessing(true);
    // Close camera with preview when processing
    await closeCamera();
    Vibration.vibrate(200);
    // Process with delay for better UX
    setTimeout(async () => {
      try {
        await handleDeviceProvision(qrData);
      } catch (error: any) {
        console.error("[QR Scan] Provisioning error:", error);
        const errorMessage = error?.message || "Unknown error";

        // Use utility function to handle error
        handleQRScanError(errorMessage, t, toast, resetScanState);
      }
    }, 1000);
  };

  // Re-check Bluetooth state periodically when it's disabled
  useEffect(() => {
    if (bluetoothEnabled === false && !isCheckingBluetooth) {
      const interval = setInterval(() => {
        checkBluetoothPermissions();
      }, 3000); // Check every 3 seconds to reduce re-renders
      return () => clearInterval(interval);
    }
  }, [bluetoothEnabled, isCheckingBluetooth]);

  // Reset scan state and disconnect device when screen comes into focus
  // Close camera when screen loses focus (navigating away)
  useFocusEffect(
    useCallback(() => {
      // When screen comes into focus, reset and enable camera
      handleScanAgain();
      
      // Cleanup: Close camera with preview when screen loses focus (navigating away)
      return () => {
        // Close camera with preview when navigating away from this screen
        closeCamera().catch(console.error);
      };
    }, [])
  );

  // Additional cleanup on component unmount
  useEffect(() => {
    return () => {
      // Ensure camera is closed when component unmounts
      closeCamera().catch(console.error);
    };
  }, []);

  return (
    <ScreenWrapper style={{ ...globalStyles.screenWrapper, padding: 0 }} qaId="screen_wrapper_scan_qr">
      <Header
        label={t("device.scan.qr.title")}
        rightSlot={<QrCode {...testProps("icon_qr_code")} size={24} color={tokens.colors.primary} />}
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
              missingPermission={getMissingPermission(bleGranted, locationGranted)}
              testIdPrefix="scan_qr"
            />
          ) : bluetoothEnabled === false && !isCheckingBluetooth ? (
            <BluetoothDisabledScreen />
          ) : (
            <View style={globalStyles.scannerContainer}>
              {/* Show preview image as background when camera is closed */}
              {!isCameraActive && previewImageUri && (
                <Image
                  source={{ uri: previewImageUri }}
                  style={[globalStyles.scanner, { position: "absolute" }]}
                  resizeMode="cover"
                />
              )}
              {/* Show camera when active */}
              {isCameraActive && (
                <CameraView
                  ref={cameraRef}
                  style={globalStyles.scanner}
                  facing={cameraType}
                  barcodeScannerSettings={{
                    barcodeTypes: ["qr"],
                  }}
                  onBarcodeScanned={handleBarCodeScanned}
                />
              )}
              <ScannerOverlay isProcessing={isProcessing} scanned={scanned} />

              <View {...testProps("view_camera_controls")} style={globalStyles.cameraControlsContainer}>
                <TouchableOpacity
                  {...testProps("button_toggle")}
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
                    <Text {...testProps("text_scan_again")} style={globalStyles.actionButtonTextPrimary}>
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
  processingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  processingText: {
    marginTop: tokens.spacing._10,
    color: tokens.colors.white,
    fontSize: 16,
  },
});

export default ScanQR;
