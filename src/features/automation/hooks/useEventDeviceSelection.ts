/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo } from "react";
import type { ESPCDFNode, ESPCDFDevice } from "@store";
import { deepClone } from "@shared/utils/common";
import { getEventInfoFromEvents } from "@features/automation/utils/automationManagement";
import { sortByConnectivity } from "@shared/utils/eventDeviceSelection";
import { isBridgeParentInfrastructureNode } from "@shared/utils/rmngMatterDeviceClassification";
import { useCDF } from "@shared/hooks/useCDF";
import { useAutomation } from "@context/automation.context";
import { useDeviceSelectionBase } from "@features/automation/hooks/useDeviceSelectionBase";
import type { DeviceSelectionData } from "@src/types/global";

// --- Result types (structured outcomes for UI to interpret) ---

export type SelectEventDeviceResult =
  | { success: true; navigateParams: { pathname: string; params: object } }
  | { success: false };

export interface UseEventDeviceSelectionParams {
  isEditingEvent?: string;
}

export interface UseEventDeviceSelectionResult {
  /** All devices for event selection (sorted: online first) */
  devices: DeviceSelectionData[];
  /** Current event info from context (first device-param event) */
  currentEventInfo: ReturnType<typeof getEventInfoFromEvents> | null;
  /** The device that matches the current event (for highlighting) */
  currentEventDevice: DeviceSelectionData | null;
  /** Devices currently selected for event */
  selectedDevices: DeviceSelectionData[];
  /** Devices not selected */
  nonSelectedDevices: DeviceSelectionData[];
  /** Whether a device row should be disabled in the picker. */
  isDeviceDisabled: (node: ESPCDFNode, isOnline: boolean) => boolean;
  /** Select a device for event; returns navigate params on success. Caller handles router.push. */
  selectDevice: (device: DeviceSelectionData) => SelectEventDeviceResult;
}

/**
 * Hook that encapsulates Event Device Selection business logic.
 * No UI side effects (toast, navigation, i18n). Returns structured results
 * for the screen to interpret and display.
 */
export function useEventDeviceSelection(
  params: UseEventDeviceSelectionParams
): UseEventDeviceSelectionResult {
  const { isEditingEvent } = params;
  const { store } = useCDF();
  const { state, setSelectedEventDevice, checkDeviceDisabled } = useAutomation();

  const currentEventInfo = useMemo(
    () => getEventInfoFromEvents(state.events),
    [state.events]
  );

  const devices = useMemo(() => {
    const home = store.getCurrentHome();
    const automationNodes = store.getNodesForCurrentHome();
    if (!home || automationNodes.length === 0) return [];

    const allDevices: DeviceSelectionData[] = [];

    automationNodes.forEach((node) => {
      if (isBridgeParentInfrastructureNode(node)) return;
      const nodeDevices = node?.devices ?? [];
      nodeDevices
        .filter((device) => device.params && device.params.length > 0)
        .forEach((device) => {
          const isSelected =
            !!currentEventInfo &&
            node.id === state.nodeId &&
            device.name === currentEventInfo.deviceName;

          allDevices.push({
            node: deepClone(node) as ESPCDFNode,
            device: deepClone(device) as ESPCDFDevice,
            isSelected,
            isMaxSceneReached: false,
          });
        });
    });

    return sortByConnectivity(
      allDevices,
      (d) => d.node.connectivityStatus?.isConnected ?? false
    );
  }, [store, currentEventInfo, state.nodeId]);

  const currentEventDevice = useMemo(() => {
    if (!currentEventInfo) return null;
    return (
      devices.find(
        (d) =>
          d.node.id === state.nodeId &&
          d.device.name === currentEventInfo.deviceName
      ) ?? null
    );
  }, [currentEventInfo, devices, state.nodeId]);

  const { selectedDevices, nonSelectedDevices, isDeviceDisabled } =
    useDeviceSelectionBase(devices, checkDeviceDisabled);

  const selectDevice = useCallback(
    (device: DeviceSelectionData): SelectEventDeviceResult => {
      setSelectedEventDevice({
        nodeId: device.node.id,
        deviceName: device.device.name,
        displayName: device.device.displayName ?? "",
      });

      return {
        success: true,
        navigateParams: {
          pathname: "/(automation)/EventDeviceParamSelection",
          params: { isEditingEvent: isEditingEvent ?? "false" },
        },
      };
    },
    [isEditingEvent, setSelectedEventDevice]
  );

  return {
    devices,
    currentEventInfo,
    currentEventDevice,
    selectedDevices,
    nonSelectedDevices,
    isDeviceDisabled,
    selectDevice,
  };
}
