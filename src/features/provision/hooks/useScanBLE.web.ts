/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { AppState } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ESPCDFProvisioningDevice, ESPCDFTransport } from "@store";
import { useCDF } from "@shared/hooks/useCDF";
import { useToast } from "@shared/hooks/useToast";
import { useDevicePermissions } from "./useDevicePermissions";
import { parseRMakerCapabilities } from "@features/provision/utils/rmakerCapabilities";
import { getAgentTermsAccepted } from "@features/agent/utils/storage";
import ESPAppUtilityAdapter from "@native-adaptors/implementations/ESPAppUtilityAdapter";
import { getScanErrorType } from "@features/provision/utils/scanBLEHelper";
import {
  getSupportedDeviceTypes,
  isAIAgentFromAdvertisement,
} from "@shared/utils/device";
import {
  WEB_BLE_LOG_PREFIX,
  WEB_BLE_PICKER_CANCEL_SUBSTRING,
  WEB_BLE_PICKER_NOT_FOUND_ERROR,
} from "@shared/utils/constants";
import { logWebDebug } from "@shared/utils/webDebugLog";
import { DEFAULT_PROVISION_DEVICE_PREFIX } from "@features/provision/constants";
import type {
  UseScanBLEReturn,
  UseScanBLEWebReturn,
} from "./useScanBLE.types";

export type { UseScanBLEReturn, UseScanBLEWebReturn } from "./useScanBLE.types";

/**
 * Web BLE scan/connect hook — opens the browser device picker and auto-connects.
 * Native builds resolve `useScanBLE.ts` instead via Metro platform extensions.
 * Returns {@link UseScanBLEWebReturn} so callers on web can read
 * `webNeedsUserConnect`; the shared {@link UseScanBLEReturn} stays
 * platform-agnostic.
 * @returns Scan BLE state and handlers for web provisioning
 */
export const useScanBLE = (): UseScanBLEWebReturn => {
  const toast = useToast();
  const { store } = useCDF();
  const router = useRouter();
  const { t } = useTranslation();
  const {
    bleGranted,
    locationGranted,
    bluetoothEnabled,
    isChecking,
    allPermissionsGranted,
    checkPermissions,
  } = useDevicePermissions();

  const [devicePrefix] = useState<string>(DEFAULT_PROVISION_DEVICE_PREFIX);
  const [isScanning, setIsScanning] = useState(false);
  const [connectingDevice, setConnectingDevice] = useState<
    Record<string, boolean>
  >({});
  const [scannedDevices, setScannedDevices] = useState<
    ESPCDFProvisioningDevice[]
  >([]);
  const [showAgentTerms, setShowAgentTerms] = useState(false);
  const [pendingAIAgentDevice, setPendingAIAgentDevice] =
    useState<ESPCDFProvisioningDevice | null>(null);
  const [webNeedsUserConnect, setWebNeedsUserConnect] = useState(false);

  const availableDevices = getSupportedDeviceTypes();
  const user = store?.userStore?.user;
  const hasAttemptedScanRef = useRef(false);
  const scanInFlightRef = useRef(false);
  const handleBleDeviceConnectRef = useRef<
    (device: ESPCDFProvisioningDevice) => Promise<void>
  >(async () => undefined);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        checkPermissions();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [checkPermissions]);

  /**
   * Maps BLE scan errors to permission toasts or silent empty states.
   * @param errorMessage - Error message from the scan API
   * @param errorCode - Optional error code or name
   */
  const handleBleScanError = useCallback(
    (errorMessage: string, errorCode?: string) => {
      const errorType = getScanErrorType(errorMessage, errorCode);

      switch (errorType) {
        case "permission": {
          ESPAppUtilityAdapter.requestAllPermissions();
          toast.showError(t("device.scan.ble.blePermissionRequired"));
          setTimeout(() => {
            checkPermissions();
          }, 2000);
          break;
        }
        case "bluetoothDisabled": {
          toast.showError(t("device.scan.ble.bluetoothDisabled"));
          break;
        }
        case "noDevices":
          break;
        case "scanFailed":
        case "generic":
        default: {
          toast.showError(t("device.scan.ble.scanFailed"));
          break;
        }
      }
    },
    [t, toast, checkPermissions],
  );

  /**
   * Opens the Web Bluetooth picker and auto-connects to the selected device.
   * Sets scanning immediately so the spinner is visible before the picker appears.
   * Search starts on the same user gesture (no awaits) so the browser chooser can open.
   */
  const handleBleDeviceScan = useCallback(async () => {
    if (scanInFlightRef.current) {
      return;
    }

    scanInFlightRef.current = true;
    setIsScanning(true);
    setWebNeedsUserConnect(false);

    try {
      logWebDebug(WEB_BLE_LOG_PREFIX, "scan:start", { devicePrefix });

      const deviceList = await user?.searchESPDevices(
        devicePrefix,
        ESPCDFTransport.BLE,
      );
      const processedDevices = deviceList ?? [];

      logWebDebug(WEB_BLE_LOG_PREFIX, "scan:complete", {
        count: processedDevices.length,
        names: processedDevices.map((device) => device.name),
      });

      if (processedDevices.length > 0) {
        logWebDebug(WEB_BLE_LOG_PREFIX, "scan:pair-start", {
          deviceName: processedDevices[0].name,
        });
        await handleBleDeviceConnectRef.current(processedDevices[0]);
        return;
      }

      setScannedDevices([]);
      setWebNeedsUserConnect(true);
    } catch (error: unknown) {
      console.error(WEB_BLE_LOG_PREFIX, "scan:error", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode = error instanceof Error ? error.name : undefined;

      setScannedDevices([]);

      const userCancelledPicker =
        errorCode === WEB_BLE_PICKER_NOT_FOUND_ERROR ||
        errorMessage
          .toLowerCase()
          .includes(WEB_BLE_PICKER_CANCEL_SUBSTRING);

      if (userCancelledPicker) {
        setWebNeedsUserConnect(true);
        return;
      }

      handleBleScanError(errorMessage, errorCode);
    } finally {
      scanInFlightRef.current = false;
      setIsScanning(false);
    }
  }, [user, handleBleScanError, devicePrefix]);

  /**
   * Resets scan state and triggers a new browser device picker flow.
   * Marks scanning immediately so the spinner appears on the same tap as the picker.
   */
  const handleScanAgain = useCallback(() => {
    if (scanInFlightRef.current) {
      return;
    }

    setIsScanning(true);
    setScannedDevices([]);
    setConnectingDevice({});
    setWebNeedsUserConnect(false);

    const device = store.nodeStore.connectedDevice;
    if (device) {
      try {
        device.disconnect();
        store.nodeStore.connectedDevice = null;
      } catch (error) {
        console.error(WEB_BLE_LOG_PREFIX, "scan:disconnect-error", error);
      }
    }

    hasAttemptedScanRef.current = false;
    void handleBleDeviceScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, [store, handleBleDeviceScan]);

  useEffect(() => {
    if (
      !allPermissionsGranted ||
      bluetoothEnabled === false ||
      !user ||
      isScanning ||
      hasAttemptedScanRef.current
    ) {
      return;
    }

    hasAttemptedScanRef.current = true;
    setWebNeedsUserConnect(true);
  }, [allPermissionsGranted, bluetoothEnabled, user, isScanning]);

  useEffect(() => {
    if (allPermissionsGranted && bluetoothEnabled === false) {
      const interval = setInterval(() => {
        checkPermissions();
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [allPermissionsGranted, bluetoothEnabled, checkPermissions]);

  useFocusEffect(
    useCallback(() => {
      scanInFlightRef.current = false;
      setIsScanning(false);
      setScannedDevices([]);
      setConnectingDevice({});
      hasAttemptedScanRef.current = false;
      setWebNeedsUserConnect(true);

      const device = store.nodeStore.connectedDevice;
      if (device) {
        try {
          device.disconnect();
          store.nodeStore.connectedDevice = null;
        } catch (error) {
          console.error(WEB_BLE_LOG_PREFIX, "scan:disconnect-error", error);
        }
      }
    }, [store]),
  );

  /**
   * Connects to a BLE device and routes into POP, claiming, or Wi-Fi.
   * @param device - CDF provisioning device from search
   */
  const handleBleDeviceConnect = useCallback(
    async (device: ESPCDFProvisioningDevice) => {
      logWebDebug(WEB_BLE_LOG_PREFIX, "pair:handler-start", {
        deviceName: device.name,
      });

      if (isAIAgentFromAdvertisement(device.advertisementData)) {
        const termsAccepted = user ? getAgentTermsAccepted(user) : null;
        if (!termsAccepted) {
          setPendingAIAgentDevice(device);
          setShowAgentTerms(true);
          return;
        }
      }

      if (connectingDevice[device.name]) {
        return;
      }

      setConnectingDevice((prev) => ({
        ...prev,
        [device.name]: true,
      }));

      try {
        const connected = await device.connect();
        if (!connected) {
          toast.showError(t("device.errors.connectionFailed"));
          return;
        }

        store.nodeStore.connectedDevice = device;

        const versionInfo = await device.getDeviceVersionInfo();
        const provCapabilities = await device.getDeviceCapabilities();
        const rmakerCaps = parseRMakerCapabilities(
          versionInfo,
          provCapabilities,
        );

        logWebDebug(WEB_BLE_LOG_PREFIX, "pair:parsed-caps", {
          deviceName: device.name,
          rmakerCaps,
          versionInfo,
          provCapabilities,
        });

        if (rmakerCaps.requiresPop) {
          router.push({
            pathname: "/(provision)/POP",
            params: {
              hasClaimCap: rmakerCaps.hasClaim ? "true" : "false",
              hasCameraClaim: rmakerCaps.hasCameraClaim ? "true" : "false",
            },
          });
          return;
        }

        await device.initializeSession();

        if (rmakerCaps.hasClaim) {
          router.push({
            pathname: "/(provision)/Claiming",
            params: {
              isCameraDevice: rmakerCaps.hasCameraClaim ? "true" : "false",
            },
          });
          return;
        }

        router.push({
          pathname: "/(provision)/Wifi",
        });
      } catch (error) {
        console.error(WEB_BLE_LOG_PREFIX, "pair:handler-error", error);
        toast.showError(t("device.errors.connectionFailed"));
        if (store.nodeStore.connectedDevice === device) {
          store.nodeStore.connectedDevice = null;
        }
      } finally {
        setConnectingDevice((prev) => {
          const newState = { ...prev };
          delete newState[device.name];
          return newState;
        });
      }
    },
    [connectingDevice, user, toast, t, router, store],
  );

  handleBleDeviceConnectRef.current = handleBleDeviceConnect;

  /**
   * Continues connect flow after agent terms are accepted.
   */
  const handleAgentTermsComplete = useCallback(() => {
    setShowAgentTerms(false);
    if (pendingAIAgentDevice) {
      void handleBleDeviceConnect(pendingAIAgentDevice);
      setPendingAIAgentDevice(null);
    }
  }, [pendingAIAgentDevice, handleBleDeviceConnect]);

  /**
   * Dismisses agent terms without connecting.
   */
  const handleAgentTermsClose = useCallback(() => {
    setShowAgentTerms(false);
    setPendingAIAgentDevice(null);
  }, []);

  return {
    isScanning,
    scannedDevices,
    connectingDevice,
    showAgentTerms,
    devicePrefix,
    availableDevices,
    bleGranted: bleGranted ?? false,
    locationGranted: locationGranted ?? false,
    bluetoothEnabled,
    isChecking,
    allPermissionsGranted,
    webNeedsUserConnect,
    handleScanAgain,
    handleBleDeviceConnect,
    handleAgentTermsComplete,
    handleAgentTermsClose,
  };
};
