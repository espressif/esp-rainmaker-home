/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFProvisioningDevice } from "@store";
import { getBleScanErrorType } from "@shared/utils/device";
import {
  QR_PROVISION_CONNECT_TIMEOUT_ERROR,
  QR_PROVISION_CONNECT_TIMEOUT_MS,
} from "@shared/utils/constants";
import { withTimeout } from "@shared/utils/asyncTimeout";

export type BleScanErrorType =
  | "permission"
  | "noDevices"
  | "scanFailed"
  | "bluetoothDisabled"
  | "generic";

/**
 * Classifies a BLE scan failure for UI handling.
 * @param errorMessage - Error message from the scan failure
 * @param errorCode - Optional platform or SDK error code
 * @returns Classified BLE scan error type
 */
export const getScanErrorType = (
  errorMessage: string,
  errorCode?: string,
): BleScanErrorType => {
  return getBleScanErrorType(errorMessage, errorCode);
};

/**
 * Returns whether an error is a BLE connect timeout.
 * @param error - Error thrown from connect or timeout helpers
 * @returns True when the error is a connect-timeout rejection
 */
export const isConnectTimeout = (error: unknown): boolean =>
  error instanceof Error &&
  error.message === QR_PROVISION_CONNECT_TIMEOUT_ERROR;

/**
 * Fire-and-forget disconnect so UI recovery is not blocked on GATT teardown.
 * @param device - Provisioning device whose native connect may still be in flight
 */
export const safeDisconnect = (
  device: ESPCDFProvisioningDevice | null | undefined,
): void => {
  device?.disconnect?.().catch(() => {});
};

/**
 * Connects a provisioning device with timeout and tears down on timeout.
 * @param device - Provisioning device to connect
 * @param timeoutMs - Maximum wait time in milliseconds
 * @param timeoutError - Error message used when the timeout wins
 * @returns True when connect succeeds before the timeout
 */
export const connectWithTimeout = async (
  device: ESPCDFProvisioningDevice,
  timeoutMs: number = QR_PROVISION_CONNECT_TIMEOUT_MS,
  timeoutError: string = QR_PROVISION_CONNECT_TIMEOUT_ERROR,
): Promise<boolean> => {
  try {
    return await withTimeout(device.connect(), timeoutMs, timeoutError);
  } catch (error: unknown) {
    if (isConnectTimeout(error)) {
      safeDisconnect(device);
    }
    throw error;
  }
};
