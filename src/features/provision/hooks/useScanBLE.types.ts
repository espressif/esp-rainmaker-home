/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEVICE_TYPE_LIST } from "@/config/devices.config";
import type { ESPCDFProvisioningDevice } from "@store";

/** Shared return type for native and web `useScanBLE` hook variants. */
export interface UseScanBLEReturn {
  isScanning: boolean;
  scannedDevices: ESPCDFProvisioningDevice[];
  connectingDevice: Record<string, boolean>;
  showAgentTerms: boolean;
  devicePrefix: string;
  availableDevices: typeof DEVICE_TYPE_LIST;
  bleGranted: boolean;
  locationGranted: boolean;
  bluetoothEnabled: boolean | null;
  isChecking: boolean;
  allPermissionsGranted: boolean;
  handleScanAgain: () => void;
  handleBleDeviceConnect: (device: ESPCDFProvisioningDevice) => void;
  handleAgentTermsComplete: () => void;
  handleAgentTermsClose: () => void;
}

/**
 * Web-only extension of {@link UseScanBLEReturn}. `webNeedsUserConnect`
 * gates the manual "Connect" button that the Web Bluetooth picker requires
 * (the picker call must originate from a user gesture). Native has no
 * equivalent, so the field stays off the shared type.
 */
export interface UseScanBLEWebReturn extends UseScanBLEReturn {
  webNeedsUserConnect: boolean;
}
