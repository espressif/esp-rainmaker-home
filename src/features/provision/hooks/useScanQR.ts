/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback, type RefObject } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Dimensions, Vibration, Linking } from "react-native";
import {
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import { useTranslation } from "react-i18next";

import { ESPCDFProvisioningDevice } from "@store";
import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import type { QrCameraScannerHandle } from "@shared/components";
import {
  getCenteredGuideBounds,
  mapBarcodeToOverlayBounds,
  type DetectedQrBounds,
} from "@shared/utils/qrBounds";
import { getQRScanErrorType } from "@shared/utils/device";
import {
  QR_CODE_TYPE,
  CAMERA_TYPE_FRONT,
  CAMERA_TYPE_BACK,
  QR_PROVISION_CONNECT_TIMEOUT_ERROR,
  QR_PROVISION_CREATE_ATTEMPTS,
  QR_PROVISION_DISCONNECT_TIMEOUT_MS,
  QR_PROVISION_STEP_TIMEOUT_MS,
} from "@shared/utils/constants";
import {
  MATTER_ROUTE_PARAM_FABRIC_CONVERSION_CONSENT_REQUIRED,
  MATTER_ROUTE_PARAM_VALUE_FALSE,
} from "@features/matter/constants";
import {
  getMatterUnsupportedMessage,
  isMatterCommissioningSupported,
} from "@features/matter/utils/matterSupport";
import { parseRMakerCapabilities } from "@features/provision/utils/rmakerCapabilities";
import {
  connectWithTimeout,
  isConnectTimeout,
  safeDisconnect,
  withTimeout,
} from "@features/provision/utils/scanBLEHelper";
import {
  parseProvisionQrData,
  type ParsedQrPayload,
} from "@features/provision/utils/scanQRHelpers";
import { useDevicePermissions } from "./useDevicePermissions";
import { PROVISION_ADD_DEVICE_SELECTION_ROUTE } from "@features/provision/constants";

const { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } = Dimensions.get("window");

type CameraFacing =
  | typeof CAMERA_TYPE_FRONT
  | typeof CAMERA_TYPE_BACK;

export interface UseScanQRReturn {
  /** Expo camera permission object (null while loading). */
  permission: ReturnType<typeof useCameraPermissions>[0];
  bleGranted: boolean | null;
  locationGranted: boolean | null;
  bluetoothEnabled: boolean | null;
  isCheckingBluetooth: boolean;
  allPermissionsGranted: boolean;
  scanned: boolean;
  cameraType: CameraFacing;
  isProcessing: boolean;
  detectedQrBounds: DetectedQrBounds | null;
  showScanAgain: boolean;
  scanFailed: boolean;
  isScreenFocused: boolean;
  remountKey: number;
  cameraRef: RefObject<QrCameraScannerHandle | null>;
  /** True when camera + BLE gates allow starting capture. */
  scannerGatesOpen: boolean;
  navigateWithoutQr: () => void;
  handleRequestCameraPermission: () => Promise<void>;
  toggleCamera: () => void;
  handleScanAgain: () => void;
  handleScannedQRCode: (result: BarcodeScanningResult) => Promise<void>;
  onOverlaySizeChange: (width: number, height: number) => void;
}

/**
 * Orchestrates QR scan → BLE connect / Matter commission for the ScanQR screen.
 * @returns State and handlers consumed by the ScanQR screen composer
 */
export const useScanQR = (): UseScanQRReturn => {
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
  const [cameraType, setCameraType] = useState<CameraFacing>(CAMERA_TYPE_BACK);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedQrBounds, setDetectedQrBounds] =
    useState<DetectedQrBounds | null>(null);
  const [showScanAgain, setShowScanAgain] = useState(false);
  const [scanFailed, setScanFailed] = useState(false);
  const [isScreenFocused, setIsScreenFocused] = useState(false);
  const [remountKey, setRemountKey] = useState(0);
  const cameraRef = useRef<QrCameraScannerHandle>(null);

  const user = store?.userStore?.user;

  /**
   * Continues provisioning without a QR scan (BLE / SoftAP / On-Network).
   */
  const navigateWithoutQr = useCallback(() => {
    router.push(PROVISION_ADD_DEVICE_SELECTION_ROUTE);
  }, [router]);

  /**
   * Shows the native camera permission dialog. If the OS will not prompt again
   * (user previously denied), opens system Settings so camera access can be enabled.
   */
  const handleRequestCameraPermission = useCallback(async () => {
    const result = await requestPermission();
    if (!result.granted && !result.canAskAgain) {
      await Linking.openSettings();
    }
  }, [requestPermission]);

  /**
   * Toggles front / back camera facing.
   */
  const toggleCamera = useCallback(() => {
    setCameraType((prev) =>
      prev === CAMERA_TYPE_FRONT ? CAMERA_TYPE_BACK : CAMERA_TYPE_FRONT,
    );
  }, []);

  /**
   * Clears scan locks that block `onBarcodeScanned` and the Scan Again control.
   * Does not disconnect the provisioned device in the store.
   */
  const clearScanLocks = useCallback(() => {
    setIsProcessing(false);
    setScanned(false);
    scannedRef.current = false;
    setDetectedQrBounds(null);
    setScanFailed(false);
  }, []);

  /**
   * Fully restarts the camera via the shared scanner remount key.
   */
  const remountCamera = useCallback(() => {
    setRemountKey((key) => key + 1);
  }, []);

  /**
   * Keeps the paused QR frame and shows failure UI (red border + Scan Again).
   * Does not remount the camera until the user retries.
   */
  const markScanFailed = useCallback(() => {
    setIsProcessing(false);
    setScanFailed(true);
    setShowScanAgain(true);
  }, []);

  /**
   * Handle scan again - reset state, restart camera, disconnect prior device.
   * Resume is best-effort; unlock and remount always run so Scan Again cannot stick.
   */
  const handleScanAgain = useCallback(() => {
    void (async () => {
      try {
        await cameraRef.current?.resumePreview();
      } catch (error: unknown) {
        console.warn(
          "[QR Scan] resumePreview on scan again failed:",
          error instanceof Error ? error.message : error,
        );
      }
      clearScanLocks();
      setShowScanAgain(false);
      remountCamera();
      const device = store?.nodeStore?.connectedDevice;

      if (device) {
        safeDisconnect(device);
        store.nodeStore.connectedDevice = null;
      }
    })();
  }, [clearScanLocks, remountCamera, store]);

  const overlaySizeRef = useRef({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
  });

  /**
   * Stores overlay layout size for barcode → screen coordinate mapping.
   * @param width - Overlay width in px
   * @param height - Overlay height in px
   */
  const onOverlaySizeChange = useCallback((width: number, height: number) => {
    overlaySizeRef.current = { width, height };
  }, []);

  /**
   * Guide-frame rect used when the OS omits QR geometry (still need a red lock box).
   * @returns Centered square matching the idle scan guide
   */
  const getGuideFallbackBounds = useCallback((): DetectedQrBounds => {
    const { width: ow, height: oh } = overlaySizeRef.current;
    return getCenteredGuideBounds(ow, oh, WINDOW_WIDTH);
  }, []);

  /**
   * Invalid QR: vibrate, freeze preview, keep/lock red border, show Scan Again.
   * @param bounds - Optional detected QR rect; falls back to the guide square
   */
  const handleInvalidQRCode = useCallback(
    async (bounds: DetectedQrBounds | null) => {
      Vibration.vibrate(200);
      setDetectedQrBounds(bounds ?? getGuideFallbackBounds());
      setScanned(true);
      scannedRef.current = true;
      try {
        await cameraRef.current?.pausePreview();
      } catch (error: unknown) {
        console.warn(
          "[QR Scan] pausePreview on invalid QR failed:",
          error instanceof Error ? error.message : error,
        );
      }
      markScanFailed();
      toast.showError(t("device.scan.qr.invalidQRCode"));
    },
    [getGuideFallbackBounds, markScanFailed, t, toast],
  );

  /**
   * Navigate to WiFi setup screen.
   */
  const navigateToWifi = useCallback(() => {
    router.push({ pathname: "/(provision)/Wifi" });
  }, [router]);

  /**
   * Handle QR code provisioning logic after BLE connect.
   * @param espDevice - Connected provisioning device
   * @param pop - Proof of possession from the QR payload (may be empty)
   */
  const handleQRProvisioning = useCallback(
    async (espDevice: ESPCDFProvisioningDevice, pop: string) => {
      let versionInfo: Record<string, unknown> | null | undefined;
      let provCapabilities: string[];

      try {
        versionInfo = (await withTimeout(
          espDevice.getDeviceVersionInfo(),
          QR_PROVISION_STEP_TIMEOUT_MS,
          QR_PROVISION_CONNECT_TIMEOUT_ERROR,
        )) as Record<string, unknown>;
      } catch (error: unknown) {
        console.error(
          "[QR Provisioning] Error fetching version info:",
          error instanceof Error ? error.message : error,
        );
        throw error;
      }

      try {
        provCapabilities = await withTimeout(
          espDevice.getDeviceCapabilities(),
          QR_PROVISION_STEP_TIMEOUT_MS,
          QR_PROVISION_CONNECT_TIMEOUT_ERROR,
        );
      } catch (error: unknown) {
        console.error(
          "[QR Provisioning] Error fetching capabilities:",
          error instanceof Error ? error.message : error,
        );
        throw error;
      }

      const rmakerCaps = parseRMakerCapabilities(versionInfo, provCapabilities);

      if (rmakerCaps.requiresPop && pop) {
        try {
          const popSet = await withTimeout(
            espDevice.setProofOfPossession(pop),
            QR_PROVISION_STEP_TIMEOUT_MS,
            QR_PROVISION_CONNECT_TIMEOUT_ERROR,
          );
          if (!popSet) {
            markScanFailed();
            toast.showError(t("device.scan.qr.invalidQRCode"));
            return;
          }
        } catch (error: unknown) {
          console.error(
            "[QR Provisioning] POP set error:",
            error instanceof Error ? error.message : error,
          );
          if (isConnectTimeout(error)) throw error;
          markScanFailed();
          toast.showError(t("device.scan.qr.invalidQRCode"));
          return;
        }
      } else if (rmakerCaps.requiresPop && !pop) {
        router.push({
          pathname: "/(provision)/POP",
          params: {
            hasClaimCap: rmakerCaps.hasClaim ? "true" : "false",
            hasCameraClaim: rmakerCaps.hasCameraClaim ? "true" : "false",
          },
        });
        return;
      }

      try {
        const isSessionInitialized = await withTimeout(
          espDevice.initializeSession(),
          QR_PROVISION_STEP_TIMEOUT_MS,
          QR_PROVISION_CONNECT_TIMEOUT_ERROR,
        );
        if (!isSessionInitialized) {
          markScanFailed();
          toast.showError(t("device.scan.qr.sessionInitFailed"));
          return;
        }
      } catch (error: unknown) {
        console.error(
          "[QR Provisioning] Session init error:",
          error instanceof Error ? error.message : error,
        );
        throw error;
      }

      if (rmakerCaps.hasClaim) {
        router.push({
          pathname: "/(provision)/Claiming",
          params: {
            isCameraDevice: rmakerCaps.hasCameraClaim ? "true" : "false",
          },
        });
        return;
      }
      navigateToWifi();
    },
    [markScanFailed, navigateToWifi, router, t, toast],
  );

  /**
   * Categorizes QR scan errors and shows the matching toast / failure UI.
   * @param errorMessage - Raw error message from the provision attempt
   */
  const handleQRScanError = useCallback(
    (errorMessage: string) => {
      const errorType = getQRScanErrorType(errorMessage);

      switch (errorType) {
        case "permission": {
          requestBluetoothPermissions();
          toast.showError(t("device.scan.qr.bluetoothPermissionRequired"));
          setTimeout(async () => {
            await checkBluetoothPermissions();
            markScanFailed();
          }, 1500);
          break;
        }
        case "bluetoothDisabled": {
          toast.showError(t("device.scan.qr.bluetoothDisabled"));
          markScanFailed();
          break;
        }
        case "connection": {
          toast.showError(t("device.scan.qr.unableToConnectToDevice"));
          markScanFailed();
          break;
        }
        case "session": {
          toast.showError(t("device.scan.qr.sessionInitFailed"));
          markScanFailed();
          break;
        }
        case "generic":
        default: {
          void (async () => {
            await checkBluetoothPermissions();
            setTimeout(() => {
              if (bluetoothEnabled === false) {
                toast.showError(t("device.scan.qr.bluetoothDisabled"));
              } else if (!allPermissionsGranted) {
                toast.showError(
                  t("device.scan.qr.bluetoothPermissionRequired"),
                );
              } else {
                toast.showError(t("device.scan.qr.invalidQRCode"));
              }
              markScanFailed();
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
      markScanFailed,
      t,
      toast,
    ],
  );

  /**
   * Handle Matter QR code commissioning.
   * @param qrData - Full Matter QR payload string
   */
  const handleMatterCommissioning = useCallback(
    async (qrData: string) => {
      try {
        if (!isMatterCommissioningSupported()) {
          toast.showError(getMatterUnsupportedMessage(t));
          markScanFailed();
          return;
        }

        if (!user) {
          toast.showError(t("device.scan.qr.matterAuthRequired"));
          markScanFailed();
          return;
        }
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
          t("device.scan.qr.matterCommissioningFailed", {
            error: errorMessage,
          }),
        );
        markScanFailed();
      }
    },
    [markScanFailed, router, t, toast, user],
  );

  /**
   * Creates the provisioning device, connects, and runs post-connect steps.
   * @param qrData - Parsed ESP / RainMaker QR fields
   */
  const handleDeviceProvision = useCallback(
    async (qrData: ParsedQrPayload) => {
      await checkBluetoothPermissions();

      if (!allPermissionsGranted) {
        requestBluetoothPermissions();
        toast.showError(t("device.scan.qr.bluetoothPermissionRequired"));
        markScanFailed();
        return;
      }

      if (bluetoothEnabled === false) {
        toast.showError(t("device.scan.qr.bluetoothDisabled"));
        markScanFailed();
        return;
      }

      const { security = 2, name, pop, transport } = qrData;

      if (!name || !transport) {
        markScanFailed();
        toast.showError(t("device.scan.qr.unableToConnectToDevice"));
        return;
      }

      const previousDevice = store?.nodeStore?.connectedDevice;
      if (previousDevice) {
        try {
          await withTimeout(
            previousDevice.disconnect(),
            QR_PROVISION_DISCONNECT_TIMEOUT_MS,
            QR_PROVISION_CONNECT_TIMEOUT_ERROR,
          );
        } catch {
          // Best-effort teardown; the fresh connect below supersedes it.
        }
        store.nodeStore.connectedDevice = null;
      }

      let cdfDevice: ESPCDFProvisioningDevice | null | undefined;
      for (let attempt = 1; attempt <= QR_PROVISION_CREATE_ATTEMPTS; attempt++) {
        try {
          cdfDevice = await withTimeout(
            Promise.resolve(
              user?.createProvisioningDevice(name, transport, security, pop),
            ),
            QR_PROVISION_STEP_TIMEOUT_MS,
            QR_PROVISION_CONNECT_TIMEOUT_ERROR,
          );
        } catch (error: unknown) {
          console.error(
            `[QR Scan] Create device attempt ${attempt} failed:`,
            error instanceof Error ? error.message : error,
          );
          cdfDevice = null;
        }
        if (cdfDevice?.name) break;
      }

      if (!cdfDevice?.name) {
        markScanFailed();
        toast.showError(t("device.scan.qr.unableToConnectToDevice"));
        return;
      }

      const connected = await connectWithTimeout(cdfDevice);

      if (!connected) {
        markScanFailed();
        toast.showError(t("device.scan.qr.unableToConnectToDevice"));
        return;
      }

      store.nodeStore.connectedDevice = cdfDevice;

      try {
        await handleQRProvisioning(cdfDevice, pop ?? "");
      } catch (error: unknown) {
        safeDisconnect(cdfDevice);
        store.nodeStore.connectedDevice = null;
        throw error;
      }
    },
    [
      allPermissionsGranted,
      bluetoothEnabled,
      checkBluetoothPermissions,
      handleQRProvisioning,
      markScanFailed,
      requestBluetoothPermissions,
      store,
      t,
      toast,
      user,
    ],
  );

  /**
   * Main handler for barcode scanning from the shared camera scanner.
   * @param result - Expo barcode scan result
   */
  const handleScannedQRCode = useCallback(
    async (result: BarcodeScanningResult) => {
      if (scanned || scannedRef.current) return;
      scannedRef.current = true;
      setScanned(true);
      const { width: ow, height: oh } = overlaySizeRef.current;
      const bounds = mapBarcodeToOverlayBounds(result, ow, oh);
      setDetectedQrBounds(bounds);

      if (result.type !== QR_CODE_TYPE || !result.data) {
        await handleInvalidQRCode(bounds);
        return;
      }

      const parsed = parseProvisionQrData(result.data);
      if (parsed.kind === "invalid") {
        await handleInvalidQRCode(bounds);
        return;
      }

      setIsProcessing(true);
      try {
        await cameraRef.current?.pausePreview();
      } catch (error: unknown) {
        console.warn(
          "[QR Scan] pausePreview failed:",
          error instanceof Error ? error.message : error,
        );
      }
      Vibration.vibrate(200);

      if (parsed.kind === "matter") {
        try {
          await handleMatterCommissioning(parsed.qrData);
        } catch {
          toast.showError(t("device.scan.qr.matterCommissioningFailed"));
          markScanFailed();
        }
        return;
      }

      try {
        await handleDeviceProvision(parsed.payload);
      } catch (error: unknown) {
        console.error("[QR Scan] Provisioning error:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        if (isConnectTimeout(error)) {
          toast.showError(t("device.scan.qr.unableToConnectToDevice"));
          markScanFailed();
          return;
        }

        handleQRScanError(errorMessage);
      }
    },
    [
      handleDeviceProvision,
      handleInvalidQRCode,
      handleMatterCommissioning,
      handleQRScanError,
      markScanFailed,
      scanned,
      t,
      toast,
    ],
  );

  // Re-check Bluetooth state periodically when it's disabled
  useEffect(() => {
    if (bluetoothEnabled === false && !isCheckingBluetooth) {
      const interval = setInterval(() => {
        checkBluetoothPermissions();
      }, 3000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, [bluetoothEnabled, isCheckingBluetooth]);

  // Track focus; release camera on blur (keeps store connectedDevice intact).
  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      clearScanLocks();
      setShowScanAgain(false);
      return () => {
        setIsScreenFocused(false);
      };
    }, [clearScanLocks]),
  );

  const scannerGatesOpen =
    Boolean(permission?.granted) &&
    allPermissionsGranted &&
    bluetoothEnabled !== false &&
    !isCheckingBluetooth;

  return {
    permission,
    bleGranted,
    locationGranted,
    bluetoothEnabled,
    isCheckingBluetooth,
    allPermissionsGranted,
    scanned,
    cameraType,
    isProcessing,
    detectedQrBounds,
    showScanAgain,
    scanFailed,
    isScreenFocused,
    remountKey,
    cameraRef,
    scannerGatesOpen,
    navigateWithoutQr,
    handleRequestCameraPermission,
    toggleCamera,
    handleScanAgain,
    handleScannedQRCode,
    onOverlaySizeChange,
  };
};
