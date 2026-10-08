/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { ESPCDFProvisioningDevice } from "@store";
import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import { getQRScanErrorType } from "@shared/utils/device";
import {
  PROVISION_TRANSPORT_BLE,
  PROVISION_TRANSPORT_SOFTAP,
  QR_PROVISION_CONNECT_TIMEOUT_ERROR,
  QR_PROVISION_CREATE_ATTEMPTS,
  QR_PROVISION_STEP_TIMEOUT_MS,
} from "@shared/utils/constants";
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

/** Web ScanQR UI phases after upload / paste. */
export type ScanQRWebPhase = "input" | "ready" | "connecting" | "failed";

export interface UseScanQRWebReturn {
  phase: ScanQRWebPhase;
  pendingDeviceName: string;
  isProcessing: boolean;
  bleGranted: boolean | null;
  locationGranted: boolean | null;
  bluetoothEnabled: boolean | null;
  isCheckingBluetooth: boolean;
  allPermissionsGranted: boolean;
  navigateWithoutQr: () => void;
  handleParsedQrPayload: (raw: string) => Promise<void>;
  handleConnect: () => Promise<void>;
  handleScanAgain: () => void;
}

/**
 * Web QR provision hook: decode → ready (Connect CTA) → BLE create/connect.
 * Connect must run from a user gesture so Web Bluetooth can open the picker.
 * @returns State and handlers for {@link ScanQR} web screen
 */
export const useScanQR = (): UseScanQRWebReturn => {
  const toast = useToast();
  const { store } = useCDF();
  const router = useRouter();
  const { t } = useTranslation();
  const {
    bleGranted,
    locationGranted,
    bluetoothEnabled,
    isChecking: isCheckingBluetooth,
    allPermissionsGranted,
    requestPermissions: requestBluetoothPermissions,
    checkPermissions: checkBluetoothPermissions,
  } = useDevicePermissions();

  const [phase, setPhase] = useState<ScanQRWebPhase>("input");
  const [pendingPayload, setPendingPayload] = useState<ParsedQrPayload | null>(
    null,
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const connectingRef = useRef(false);
  const pendingPayloadRef = useRef<ParsedQrPayload | null>(null);
  pendingPayloadRef.current = pendingPayload;

  const user = store?.userStore?.user;
  const pendingDeviceName = pendingPayload?.name?.trim() ?? "";

  /**
   * Continues provisioning without a QR scan (BLE picker path).
   */
  const navigateWithoutQr = useCallback(() => {
    router.push(PROVISION_ADD_DEVICE_SELECTION_ROUTE);
  }, [router]);

  /**
   * Resets to the upload/paste input step and clears any prior device.
   */
  const handleScanAgain = useCallback(() => {
    connectingRef.current = false;
    setIsProcessing(false);
    setPendingPayload(null);
    setPhase("input");
    const device = store?.nodeStore?.connectedDevice;
    if (device) {
      safeDisconnect(device);
      store.nodeStore.connectedDevice = null;
    }
  }, [store]);

  /**
   * Marks the flow failed so the user can retry Connect (if armed) or Scan Again.
   */
  const markFailed = useCallback(() => {
    connectingRef.current = false;
    setIsProcessing(false);
    setPhase(pendingPayloadRef.current ? "ready" : "failed");
  }, []);

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
          "[QR Provisioning Web] Error fetching version info:",
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
          "[QR Provisioning Web] Error fetching capabilities:",
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
            markFailed();
            toast.showError(t("device.scan.qr.invalidQRCode"));
            return;
          }
        } catch (error: unknown) {
          console.error(
            "[QR Provisioning Web] POP set error:",
            error instanceof Error ? error.message : error,
          );
          if (isConnectTimeout(error)) throw error;
          markFailed();
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
          markFailed();
          toast.showError(t("device.scan.qr.sessionInitFailed"));
          return;
        }
      } catch (error: unknown) {
        console.error(
          "[QR Provisioning Web] Session init error:",
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
    [markFailed, navigateToWifi, router, t, toast],
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
          markFailed();
          break;
        }
        case "bluetoothDisabled": {
          toast.showError(t("device.scan.qr.bluetoothDisabled"));
          markFailed();
          break;
        }
        case "connection": {
          toast.showError(t("device.scan.qr.unableToConnectToDevice"));
          markFailed();
          break;
        }
        case "session": {
          toast.showError(t("device.scan.qr.sessionInitFailed"));
          markFailed();
          break;
        }
        case "generic":
        default: {
          toast.showError(t("device.scan.qr.unableToConnectToDevice"));
          markFailed();
          break;
        }
      }
    },
    [markFailed, requestBluetoothPermissions, t, toast],
  );

  /**
   * Creates the provisioning device, connects, and runs post-connect steps.
   * Starts createESPDevice ASAP so Web Bluetooth keeps the user-gesture stack.
   * @param qrData - Parsed ESP / RainMaker QR fields
   */
  const handleDeviceProvision = useCallback(
    async (qrData: ParsedQrPayload) => {
      const { security = 2, name, pop, transport } = qrData;

      if (!name || !transport) {
        markFailed();
        toast.showError(t("device.scan.qr.unableToConnectToDevice"));
        return;
      }

      if (transport !== PROVISION_TRANSPORT_BLE) {
        markFailed();
        toast.showError(t("device.scan.qr.softApUnsupportedOnWeb"));
        return;
      }

      const previousDevice = store?.nodeStore?.connectedDevice;
      if (previousDevice) {
        store.nodeStore.connectedDevice = null;
        void safeDisconnect(previousDevice);
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
            `[QR Scan Web] Create device attempt ${attempt} failed:`,
            error instanceof Error ? error.message : error,
          );
          cdfDevice = null;
        }
        if (cdfDevice?.name) break;
      }

      if (!cdfDevice?.name) {
        markFailed();
        toast.showError(t("device.scan.qr.unableToConnectToDevice"));
        return;
      }

      const connected = await connectWithTimeout(cdfDevice);

      if (!connected) {
        markFailed();
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
    [handleQRProvisioning, markFailed, store, t, toast, user],
  );

  /**
   * Parses an uploaded / pasted QR string and either rejects or arms Connect.
   * @param raw - Raw QR payload text
   */
  const handleParsedQrPayload = useCallback(
    async (raw: string) => {
      const parsed = parseProvisionQrData(raw.trim());
      if (parsed.kind === "invalid") {
        toast.showError(t("device.scan.qr.invalidQRCode"));
        setPhase("failed");
        return;
      }

      if (parsed.kind === "matter") {
        if (!isMatterCommissioningSupported()) {
          toast.showError(getMatterUnsupportedMessage(t));
        } else {
          toast.showError(t("device.scan.qr.matterUnsupportedOnWeb"));
        }
        setPhase("failed");
        return;
      }

      const transport = parsed.payload.transport;
      if (transport === PROVISION_TRANSPORT_SOFTAP) {
        toast.showError(t("device.scan.qr.softApUnsupportedOnWeb"));
        setPhase("failed");
        return;
      }

      if (
        !parsed.payload.name ||
        transport !== PROVISION_TRANSPORT_BLE
      ) {
        toast.showError(t("device.scan.qr.invalidQRCode"));
        setPhase("failed");
        return;
      }

      await checkBluetoothPermissions();
      setPendingPayload(parsed.payload);
      setPhase("ready");
    },
    [checkBluetoothPermissions, t, toast],
  );

  /**
   * User-gesture Connect: opens the name-filtered Web Bluetooth picker.
   */
  const handleConnect = useCallback(async () => {
    if (!pendingPayload || connectingRef.current) {
      return;
    }

    if (!allPermissionsGranted) {
      requestBluetoothPermissions();
      toast.showError(t("device.scan.qr.bluetoothPermissionRequired"));
      return;
    }

    if (bluetoothEnabled === false) {
      toast.showError(t("device.scan.qr.bluetoothDisabled"));
      return;
    }

    connectingRef.current = true;
    setIsProcessing(true);
    setPhase("connecting");

    try {
      await handleDeviceProvision(pendingPayload);
    } catch (error: unknown) {
      console.error("[QR Scan Web] Provisioning error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      if (isConnectTimeout(error)) {
        toast.showError(t("device.scan.qr.unableToConnectToDevice"));
        markFailed();
        return;
      }

      handleQRScanError(errorMessage);
    }
  }, [
    allPermissionsGranted,
    bluetoothEnabled,
    handleDeviceProvision,
    handleQRScanError,
    markFailed,
    pendingPayload,
    requestBluetoothPermissions,
    t,
    toast,
  ]);

  return {
    phase,
    pendingDeviceName,
    isProcessing,
    bleGranted,
    locationGranted,
    bluetoothEnabled,
    isCheckingBluetooth,
    allPermissionsGranted,
    navigateWithoutQr,
    handleParsedQrPayload,
    handleConnect,
    handleScanAgain,
  };
};
