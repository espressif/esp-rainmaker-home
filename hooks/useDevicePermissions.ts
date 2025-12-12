/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { ESPAppUtilityAdapter } from "@/adaptors/implementations/ESPAppUtilityAdapter";

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
  requestPermissions: () => void;
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
   * Request all required permissions
   */
  const requestPermissions = useCallback(() => {
    try {
      // Reset initial check flag so we show loading state after explicit permission request
      isInitialCheckDone.current = false;
      ESPAppUtilityAdapter.requestAllPermissions();
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
  }, []);

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

