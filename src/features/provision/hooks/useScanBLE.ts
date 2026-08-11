/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { AppState } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ESPCDFProvisioningDevice } from "@store";
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
import { DEVICE_TYPE_LIST } from "@/config/devices.config";

export interface UseScanBLEReturn {
  // State
  isScanning: boolean;
  scannedDevices: ESPCDFProvisioningDevice[];
  connectingDevice: Record<string, boolean>;
  showAgentTerms: boolean;
  devicePrefix: string;
  availableDevices: typeof DEVICE_TYPE_LIST;

  // Permissions
  bleGranted: boolean;
  locationGranted: boolean;
  bluetoothEnabled: boolean | null;
  isChecking: boolean;
  allPermissionsGranted: boolean;

  // Handlers
  handleScanAgain: () => void;
  handleBleDeviceConnect: (device: ESPCDFProvisioningDevice) => void;
  handleAgentTermsComplete: () => void;
  handleAgentTermsClose: () => void;
}

/**
 * Custom hook for ScanBLE component business logic
 */
export const useScanBLE = (): UseScanBLEReturn => {
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

  // State
  const [devicePrefix] = useState<string>("PROV_");
  const [isScanning, setIsScanning] = useState(false);
  const [connectingDevice, setConnectingDevice] = useState<Record<string, boolean>>({});
  const [scannedDevices, setScannedDevices] = useState<ESPCDFProvisioningDevice[]>([]);
  const [showAgentTerms, setShowAgentTerms] = useState(false);
  const [pendingAIAgentDevice, setPendingAIAgentDevice] = useState<ESPCDFProvisioningDevice | null>(null);

  // Filter out disabled device types
  const availableDevices = getSupportedDeviceTypes();

  // User reference
  const user = store?.userStore?.user;

  // Track if we've attempted a scan to prevent infinite retries
  const hasAttemptedScanRef = useRef(false);

  // Re-check permissions when app comes to foreground
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
   * Handle scan again - reset state, disconnect device if connected, and trigger new scan
   */
  const handleScanAgain = useCallback(() => {
    setIsScanning(false);
    setScannedDevices([]);
    setConnectingDevice({});

    const device = store.nodeStore.connectedDevice;
    if (device) {
      device.disconnect();
      store.nodeStore.connectedDevice = null;
    }

    hasAttemptedScanRef.current = false;
    handleBleDeviceScan();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, [store]);

  /**
   * Utility function to handle BLE scan errors
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

        case "noDevices": {
          // No devices found - UI will show NoDevicesFound screen automatically
          break;
        }

        case "scanFailed": {
          toast.showError(t("device.scan.ble.scanFailed"));
          break;
        }

        case "generic":
        default: {
          toast.showError(t("device.scan.ble.scanFailed"));
          break;
        }
      }
    },
    [t, toast, checkPermissions]
  );

  /**
   * Scan for BLE devices with the default prefix
   */
  const handleBleDeviceScan = useCallback(async () => {
    if (isScanning) {
      return;
    }

    await checkPermissions();

    if (!allPermissionsGranted) {
      ESPAppUtilityAdapter.requestAllPermissions();
      return;
    }

    if (bluetoothEnabled === false) {
      return;
    }

    setIsScanning(true);

    try {
      const deviceList = await user?.searchESPBLEDevices(1);
      const processedDevices = deviceList ?? [];

      if (processedDevices.length > 0) {
        setScannedDevices(processedDevices);
        setIsScanning(false);
      } else {
        setIsScanning(false);
        setScannedDevices([]);
      }
    } catch (error: any) {
      console.error("[BLE Scan] Error:", error);
      const errorMessage = error?.message || String(error);
      const errorCode = error?.code || error?.name;

      setIsScanning(false);
      setScannedDevices([]);

      handleBleScanError(errorMessage, errorCode);
    }
  }, [
    isScanning,
    user,
    handleBleScanError,
    checkPermissions,
    allPermissionsGranted,
    bluetoothEnabled,
  ]);

  // Auto-scan when permissions are granted and Bluetooth is enabled
  useEffect(() => {
    if (
      allPermissionsGranted &&
      bluetoothEnabled &&
      user &&
      !isScanning &&
      scannedDevices.length === 0 &&
      !hasAttemptedScanRef.current
    ) {
      hasAttemptedScanRef.current = true;
      handleBleDeviceScan();
    }
  }, [
    allPermissionsGranted,
    bluetoothEnabled,
    user,
    handleBleDeviceScan,
    isScanning,
    scannedDevices.length,
  ]);

  // Re-check Bluetooth state periodically when it's disabled
  useEffect(() => {
    if (allPermissionsGranted && bluetoothEnabled === false) {
      const interval = setInterval(() => {
        checkPermissions();
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [allPermissionsGranted, bluetoothEnabled, checkPermissions]);

  // Reset state and disconnect device when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      setIsScanning(false);
      setScannedDevices([]);
      setConnectingDevice({});

      const device = store.nodeStore.connectedDevice;
      if (device) {
        try {
          device.disconnect();
          store.nodeStore.connectedDevice = null;
        } catch (error) {
          console.error("[BLE Scan] Error disconnecting device:", error);
        }
      }
    }, [store])
  );

  /**
   * Connect to a BLE device
   */
  const handleBleDeviceConnect = useCallback(async (device: ESPCDFProvisioningDevice) => {
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

      const rmakerCaps = parseRMakerCapabilities(versionInfo, provCapabilities);

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
      console.error("BLE connection error:", error);
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
  }, [connectingDevice, user, toast, t, router, store]);

  /**
   * Handle agent terms completion
   */
  const handleAgentTermsComplete = useCallback(() => {
    setShowAgentTerms(false);
    if (pendingAIAgentDevice) {
      handleBleDeviceConnect(pendingAIAgentDevice);
      setPendingAIAgentDevice(null);
    }
  }, [pendingAIAgentDevice, handleBleDeviceConnect]);

  /**
   * Handle agent terms close
   */
  const handleAgentTermsClose = useCallback(() => {
    setShowAgentTerms(false);
    setPendingAIAgentDevice(null);
  }, []);

  return {
    // State
    isScanning,
    scannedDevices,
    connectingDevice,
    showAgentTerms,
    devicePrefix,
    availableDevices,

    // Permissions
    bleGranted: bleGranted ?? false,
    locationGranted: locationGranted ?? false,
    bluetoothEnabled,
    isChecking,
    allPermissionsGranted,

    // Handlers
    handleScanAgain,
    handleBleDeviceConnect,
    handleAgentTermsComplete,
    handleAgentTermsClose,
  };
};
