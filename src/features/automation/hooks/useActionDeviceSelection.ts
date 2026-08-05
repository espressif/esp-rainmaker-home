/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo } from "react";
import type { ESPCDFNode, ESPCDFDevice } from "@store";
import { deepClone } from "@shared/utils/common";
import { getEventInfoFromEvents } from "@features/automation/utils/automationManagement";
import {
  sortByConnectivity,
  isAutomationMatterIneligibleNode,
} from "@shared/utils/eventDeviceSelection";
import { useCDF } from "@shared/hooks/useCDF";
import { useAutomation } from "@context/automation.context";
import { useDeviceSelectionBase } from "@features/automation/hooks/useDeviceSelectionBase";
import type { DeviceSelectionData } from "@src/types/global";

export type SelectActionDeviceResult =
  | { success: true; navigateParams: { pathname: string; params: object } }
  | { success: false };

export interface UseActionDeviceSelectionParams {
  isEditingAction?: string;
}

export interface UseActionDeviceSelectionResult {
  /** All devices for action selection (sorted: online first) */
  devices: DeviceSelectionData[];
  /** Current event info for summary card */
  eventInfo: ReturnType<typeof getEventInfoFromEvents> | null;
  /** Event device from store for display name */
  eventDevice: ESPCDFDevice | null;
  /** Devices currently selected for action */
  selectedDevices: DeviceSelectionData[];
  /** Devices not selected */
  nonSelectedDevices: DeviceSelectionData[];
  /** Whether a device row should be disabled in the picker. */
  isDeviceDisabled: (node: ESPCDFNode, isOnline: boolean) => boolean;
  /** Select device for action; returns navigate params on success. Caller handles router.push. */
  selectDevice: (device: DeviceSelectionData) => SelectActionDeviceResult;
  /** Remove device from action selection */
  deleteDevice: (device: DeviceSelectionData) => void;
  /** Get actions map for a selected device (param name -> value) */
  getDeviceActions: (device: DeviceSelectionData) => Record<string, unknown>;
}

/**
 * Hook that encapsulates Action Device Selection business logic.
 * No UI side effects (toast, navigation, i18n).
 */
export function useActionDeviceSelection(
  params: UseActionDeviceSelectionParams
): UseActionDeviceSelectionResult {
  const { isEditingAction } = params;
  const { store } = useCDF();
  const {
    state,
    checkDeviceDisabled,
    checkActionExists,
    setSelectedDevice,
    getActionValue,
    deleteAction,
  } = useAutomation();

  const eventInfo = useMemo(
    () => getEventInfoFromEvents(state.events),
    [state.events]
  );

  const devices = useMemo(() => {
    const home = store.getCurrentHome();
    const currentHomeNodes = store.getNodesForCurrentHome();
    if (!home || currentHomeNodes.length === 0) return [];

    const allDevices: DeviceSelectionData[] = [];

    currentHomeNodes.forEach((node) => {
      // Matter-backed nodes can't drive cloud automations. Check runs on the
      // original — the deepClone below strips the matterNodeId getter.
      if (isAutomationMatterIneligibleNode(node)) return;
      const nodeDevices = node?.devices ?? [];
      nodeDevices
        .filter((device) => device.params && device.params.length > 0)
        .forEach((device) => {
          allDevices.push({
            node: deepClone(node) as ESPCDFNode,
            device: deepClone(device) as ESPCDFDevice,
            isSelected: checkActionExists(node.id, device.name).exist,
            isMaxSceneReached: false,
          });
        });
    });

    return sortByConnectivity(
      allDevices,
      (d) => d.node.connectivityStatus?.isConnected ?? false
    );
  }, [store, checkActionExists]);

  const eventDevice = useMemo(() => {
    if (!eventInfo || !state.nodeId) return null;
    const node = store.nodeStore.nodesByIDMap?.[state.nodeId];
    if (!node?.devices) return null;
    return node.devices.find((d) => d.name === eventInfo.deviceName) ?? null;
  }, [eventInfo, state.nodeId, store.nodeStore.nodesByIDMap]);

  const { selectedDevices, nonSelectedDevices, isDeviceDisabled } =
    useDeviceSelectionBase(devices, checkDeviceDisabled);

  const selectDevice = useCallback(
    (device: DeviceSelectionData): SelectActionDeviceResult => {
      setSelectedDevice({
        nodeId: device.node.id,
        deviceName: device.device.name,
        displayName: device.device.displayName ?? "",
      });
      return {
        success: true,
        navigateParams: {
          pathname: "/(automation)/ActionDeviceParamSelection",
          params: { isEditingAction: isEditingAction ?? "false" },
        },
      };
    },
    [isEditingAction, setSelectedDevice]
  );

  const deleteDevice = useCallback(
    (device: DeviceSelectionData) => {
      deleteAction(device.node.id, device.device.name);
    },
    [deleteAction]
  );

  const getDeviceActions = useCallback(
    (device: DeviceSelectionData): Record<string, unknown> => {
      if (!device.isSelected || !device.device.params) return {};
      return device.device.params
        .filter((param) =>
          checkActionExists(device.node.id, device.device.name, param.name).exist
        )
        .reduce(
          (acc, param) => {
            acc[param.name] = getActionValue(
              device.node.id,
              device.device.name,
              param.name
            );
            return acc;
          },
          {} as Record<string, unknown>
        );
    },
    [checkActionExists, getActionValue]
  );

  return {
    devices,
    eventInfo,
    eventDevice,
    selectedDevices,
    nonSelectedDevices,
    selectDevice,
    deleteDevice,
    getDeviceActions,
    isDeviceDisabled,
  };
}
