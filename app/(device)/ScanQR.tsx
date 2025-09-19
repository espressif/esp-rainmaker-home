/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// React Native Imports
import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
  Vibration,
  ActivityIndicator,
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

// Icons
import { QrCode, Camera, CameraOff, RotateCcw } from "lucide-react-native";

// Components
import { Header, ScreenWrapper } from "@/components";

// adapters
import { provisionAdapter } from "@/adaptors/implementations/ESPProvAdapter";

// Utils
import { useToast } from "@/hooks/useToast";

const { width, height } = Dimensions.get("window");
const SCANNER_WIDTH = width * 0.8;

/**
 * AnimatedGuide
 *
 * Displays an animated guide to help users scan QR codes
 */
const AnimatedGuide = () => {
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
      style={[
        globalStyles.guideContainer,
        { opacity: fadeAnim, position: "absolute", top: height * 0.15 },
      ]}
    >
      <QrCode
        size={32}
        color={tokens.colors.white}
        style={globalStyles.guideIcon}
      />
      <Text style={globalStyles.guideText}>
        {t("device.scan.qr.holdSteady")}
      </Text>
    </Animated.View>
  );
};

/**
 * ScannerOverlay
 */
const ScannerOverlay = ({ isProcessing }: { isProcessing: boolean }) => {
  const [animation] = useState(new Animated.Value(0));
  const { t } = useTranslation();

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(animation, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <View style={globalStyles.scannerOverlay}>
      <View style={globalStyles.scannerFrameContainer}>
        <View style={styles.scannerFrame}>
          {/* Corner markers */}
          <View style={[styles.cornerMarker, styles.topLeft]} />
          <View style={[styles.cornerMarker, styles.topRight]} />
          <View style={[styles.cornerMarker, styles.bottomLeft]} />
          <View style={[styles.cornerMarker, styles.bottomRight]} />

          {isProcessing ? (
            <ActivityIndicator
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
              size={80}
              color={tokens.colors.primary}
            />
          ) : (
            <Animated.View
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
        <Text style={globalStyles.scannerText}>
          {t("device.scan.qr.alignQRCode")}
        </Text>
      </View>
      <AnimatedGuide />
    </View>
  );
};

/**
 * PermissionScreen
 */
const PermissionScreen = ({
  status,
  onRequestPermission,
}: {
  status: "requesting" | "denied";
  onRequestPermission: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <View
      style={[
        globalStyles.container,
        globalStyles.itemCenter,
        { backgroundColor: tokens.colors.bg5 },
      ]}
    >
      <View
        style={[
          globalStyles.permissionContent,
          {
            ...globalStyles.shadowElevationForLightTheme,
            backgroundColor: tokens.colors.white,
          },
        ]}
      >
        <View style={globalStyles.permissionIconContainer}>
          <CameraOff size={40} color={tokens.colors.gray} />
        </View>
        <Text style={[globalStyles.heading, globalStyles.permissionTitle]}>
          {status === "requesting"
            ? t("device.scan.qr.requestingPermission")
            : t("device.scan.qr.noCameraPermission")}
        </Text>
        <Text
          style={[globalStyles.textGray, globalStyles.permissionDescription]}
        >
          {t("device.scan.qr.cameraPermissionRequired")}
        </Text>
        {status === "denied" && (
          <TouchableOpacity
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
            <Text style={globalStyles.actionButtonTextPrimary}>
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
  const [scanned, setScanned] = useState(false);
  const scannedRef = useRef(false);
  const [cameraType, setCameraType] = useState<"front" | "back">("back");
  const [isProcessing, setIsProcessing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const toggleCamera = () => {
    setCameraType((prev) => (prev === "front" ? "back" : "front"));
  };

  /**
   * Reset the scanning state and UI
   */
  const resetScanState = () => {
    setIsProcessing(false);
    setScanned(false);
    scannedRef.current = false;
  };

  /**
   * Handle invalid QR code cases
   */
  const handleInvalidQRCode = () => {
    toast.showError(t("device.scan.qr.invalidQRCode"));
    setTimeout(() => {
      resetScanState();
      cameraRef.current?.resumePreview();
    }, 2000);
  };

  /**
   * Navigate to WiFi setup screen
   */
  const navigateToWifi = () => {
    router.push({ pathname: "/(device)/Wifi" });
  };

  /**
   * Handle Android-specific provisioning logic
   */
  const handleAndroidProvisioning = async (
    espDevice: ESPDevice,
    pop: string
  ) => {
    const capabilities = await espDevice.getDeviceCapabilities();

    // Check if device needs PoP (both no_pop and no_sec must be absent)
    if (!capabilities.includes("no_pop") && !capabilities.includes("no_sec")) {
      const popSet = await espDevice.setProofOfPossession(pop);
      if (!popSet) {
        return toast.showError(t("device.scan.qr.invalidQRCode"));
      }
    }

    // Initialize session
    const isSessionInitialized = await espDevice.initializeSession();
    if (!isSessionInitialized) {
      return toast.showError(t("device.scan.qr.sessionInitFailed"));
    }

    navigateToWifi();
  };

  /**
   * Handle device provisioning process
   */
  const handleDeviceProvision = async (qrData: any) => {
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
      return toast.showError(t("device.scan.qr.invalidQRCode"));
    }

    // Create and connect device
    const espDevice = new ESPDevice(deviceInterface);
    const connectResponse = await espDevice.connect();

    if (connectResponse !== 0) {
      return toast.showError(t("device.scan.qr.invalidQRCode"));
    }

    // Store connected device
    store.nodeStore.connectedDevice = espDevice;

    // Handle platform-specific logic
    if (Platform.OS === "ios") {
      return navigateToWifi();
    }

    if (Platform.OS === "android") {
      await handleAndroidProvisioning(espDevice, pop);
      return;
    }

    toast.showError(t("device.scan.qr.platformNotSupported"));
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
    if (result.type !== "qr" || !result.data) {
      return handleInvalidQRCode();
    }

    // Parse and validate QR data
    let qrData: any;
    try {
      qrData = JSON.parse(result.data);
      if (typeof qrData !== "object") throw new Error("Invalid QR");
    } catch {
      return handleInvalidQRCode();
    }

    // Start processing
    setIsProcessing(true);
    await cameraRef.current?.pausePreview();
    Vibration.vibrate(200);
    // Process with delay for better UX
    setTimeout(async () => {
      try {
        await handleDeviceProvision(qrData);
      } catch (error) {
        console.error(error);
        toast.showError(t("device.scan.qr.invalidQRCode"));
      } finally {
        resetScanState();
      }
    }, 1000);
  };

  const handleScanAgain = () => {
    setScanned(false);
    cameraRef.current?.resumePreview();
    setIsProcessing(false);
    scannedRef.current = false;
  };

  return (
    <ScreenWrapper style={{ ...globalStyles.screenWrapper, padding: 0 }}>
      <Header
        label={t("device.scan.qr.title")}
        rightSlot={<QrCode size={24} color={tokens.colors.primary} />}
      />

      <View style={styles.container}>
        <View style={styles.content}>
          {!permission ? (
            <PermissionScreen
              status="requesting"
              onRequestPermission={requestPermission}
            />
          ) : !permission.granted ? (
            <PermissionScreen
              status="denied"
              onRequestPermission={requestPermission}
            />
          ) : (
            <View style={globalStyles.scannerContainer}>
              <CameraView
                ref={cameraRef}
                style={globalStyles.scanner}
                facing={cameraType}
                barcodeScannerSettings={{
                  barcodeTypes: ["qr"],
                }}
                onBarcodeScanned={handleBarCodeScanned}
              />
              <ScannerOverlay isProcessing={isProcessing} />

              <View style={globalStyles.cameraControlsContainer}>
                <TouchableOpacity
                  style={globalStyles.cameraToggle}
                  onPress={toggleCamera}
                  disabled={isProcessing}
                >
                  <RotateCcw size={24} color={tokens.colors.white} />
                </TouchableOpacity>

                {scanned && (
                  <TouchableOpacity
                    style={[
                      globalStyles.actionButton,
                      globalStyles.actionButtonPrimary,
                      globalStyles.scanAgainButton,
                      isProcessing && styles.buttonDisabled,
                    ]}
                    onPress={handleScanAgain}
                  >
                    <QrCode
                      size={20}
                      color={tokens.colors.white}
                      style={styles.buttonIcon}
                    />
                    <Text style={globalStyles.actionButtonTextPrimary}>
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
