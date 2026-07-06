/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo } from "react";
import type { ESPCDFNode } from "@store";
import { isAutomationMatterIneligibleNode } from "@shared/utils/eventDeviceSelection";
import type { DeviceSelectionData } from "@src/types/global";

export interface UseDeviceSelectionBaseResult {
  /** Devices currently selected */
  selectedDevices: DeviceSelectionData[];
  /** Devices not selected */
  nonSelectedDevices: DeviceSelectionData[];
  /** Whether a device row should be disabled in the picker. */
  isDeviceDisabled: (node: ESPCDFNode, isOnline: boolean) => boolean;
}

/**
 * Shared device-selection logic common to the event and action selection hooks:
 * selected/non-selected partitioning and the per-row disabled check. The caller
 * owns building the `devices` array (the `isSelected` rule differs per hook).
 */
export function useDeviceSelectionBase(
  devices: DeviceSelectionData[],
  checkDeviceDisabled: (isOnline: boolean) => { isDisabled: boolean }
): UseDeviceSelectionBaseResult {
  const selectedDevices = useMemo(
    () => devices.filter((d) => d.isSelected),
    [devices]
  );

  const nonSelectedDevices = useMemo(
    () => devices.filter((d) => !d.isSelected),
    [devices]
  );

  const isDeviceDisabled = useCallback(
    (node: ESPCDFNode, isOnline: boolean): boolean => {
      if (isAutomationMatterIneligibleNode(node)) return true;
      return checkDeviceDisabled(isOnline).isDisabled;
    },
    [checkDeviceDisabled],
  );

  return {
    selectedDevices,
    nonSelectedDevices,
    isDeviceDisabled,
  };
}
