/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { AppState } from "react-native";
import { ESPAppUtilityAdapter } from "@native-adaptors/implementations/ESPAppUtilityAdapter";
import { promptBleAndLocationPermissions } from "@shared/permissions";

interface DevicePermissionsState {
  bleGranted: boolean | null;
  locationGranted: boolean | null;
  locationServicesEnabled: boolean | null;
  bluetoothEnabled: boolean | null;
  isChecking: boolean;
}

interface UseDevicePermissionsReturn {
  bleGranted: boolean | null;
  locationGranted: boolean | null;
  locationServicesEnabled: boolean | null;
  bluetoothEnabled: boolean | null;
  isChecking: boolean;
  allPermissionsGranted: boolean;
  requestPermissions: () => Promise<void>;
  checkPermissions: () => Promise<void>;
}

/**
 * Hook for checking and requesting device permissions (BLE and Location)
 * Used for device scanning screens (BLE, SoftAP)
 */
export const useDevicePermissions = (): UseDevicePermissionsReturn => {
  const [permissions, setPermissions] = useState<DevicePermissionsState>({
    bleGranted: null,
    locationGranted: null,
    locationServicesEnabled: null,
    bluetoothEnabled: null,
    isChecking: true,
  });

  // Track if initial check is done to avoid showing loading state on subsequent checks
  const isInitialCheckDone = useRef(false);

  /**
   * Check all required permissions and Bluetooth state
   * Only shows loading state on initial check to prevent UI flickering
   */
  const checkPermissions = useCallback(async () => {
    try {
      // Only set isChecking to true on initial load to prevent flickering
      if (!isInitialCheckDone.current) {
        setPermissions((prev) => ({ ...prev, isChecking: true }));
      }

      const [bleGranted, locationGranted, locationServicesEnabled, bluetoothEnabled] =
        await Promise.all([
          ESPAppUtilityAdapter.isBlePermissionGranted().catch(() => false),
          ESPAppUtilityAdapter.isLocationPermissionGranted().catch(() => false),
          ESPAppUtilityAdapter.isLocationServicesEnabled().catch(() => false),
          ESPAppUtilityAdapter.isBluetoothEnabled().catch(() => false),
        ]);

      // Only update state if values have actually changed to prevent unnecessary re-renders
      setPermissions((prev) => {
        const hasChanged =
          prev.bleGranted !== bleGranted ||
          prev.locationGranted !== locationGranted ||
          prev.locationServicesEnabled !== locationServicesEnabled ||
          prev.bluetoothEnabled !== bluetoothEnabled ||
          prev.isChecking !== false;

        if (!hasChanged) {
          return prev;
        }

        return {
          bleGranted,
          locationGranted,
          locationServicesEnabled,
          bluetoothEnabled,
          isChecking: false,
        };
      });

      isInitialCheckDone.current = true;
    } catch (error) {
      console.error("Error checking permissions:", error);
      setPermissions((prev) => {
        const hasChanged =
          prev.bleGranted !== false ||
          prev.locationGranted !== false ||
          prev.locationServicesEnabled !== false ||
          prev.bluetoothEnabled !== false ||
          prev.isChecking !== false;

        if (!hasChanged) {
          return prev;
        }

        return {
          bleGranted: false,
          locationGranted: false,
          locationServicesEnabled: false,
          bluetoothEnabled: false,
          isChecking: false,
        };
      });
      isInitialCheckDone.current = true;
    }
  }, []);

  /**
   * Requests the Bluetooth + location permissions needed to scan for devices.
   *
   * Always explains the purpose first: the in-app dialog names the permissions,
   * the feature and what the data is used for, and the OS prompt is only shown
   * once the user taps "Allow" there. Declining is a no-op.
   */
  const requestPermissions = useCallback(async () => {
    try {
      if (!(await promptBleAndLocationPermissions())) {
        return;
      }
      // Reset initial check flag so we show loading state after explicit permission request
      isInitialCheckDone.current = false;
      // Re-check permissions after requesting
      setTimeout(() => {
        checkPermissions();
      }, 500);
    } catch (error) {
      console.error("Error requesting permissions:", error);
    }
  }, [checkPermissions]);

  // Check permissions on mount
  useEffect(() => {
    checkPermissions();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, []);

  // Re-check when the app is active again: closing an OS permission prompt or
  // returning from Settings does that, however long the user took to answer.
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

  // Determine if all required permissions are granted
  const allPermissionsGranted =
    permissions.bleGranted === true &&
    permissions.locationGranted === true &&
    permissions.locationServicesEnabled !== false;

  return {
    bleGranted: permissions.bleGranted,
    locationGranted: permissions.locationGranted,
    locationServicesEnabled: permissions.locationServicesEnabled,
    bluetoothEnabled: permissions.bluetoothEnabled,
    isChecking: permissions.isChecking,
    allPermissionsGranted,
    requestPermissions,
    checkPermissions,
  };
};

