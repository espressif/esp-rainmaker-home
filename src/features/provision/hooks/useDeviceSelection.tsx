/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { useCDF } from "@shared/hooks/useCDF";
import { useScene } from "@context/scenes.context";
import { useSchedule } from "@context/schedules.context";
import {
  sortDevicesByConnectivity,
  getDeviceActions,
} from "@features/scene/utils/sceneHelper";
import type {
  DeviceSelectionData,
  ScheduleDeviceSelectionData,
} from "@src/types/global";
import type { ESPCDFNode, ESPCDFDevice } from "@store";
import {
  ESPRM_SCENES_SERVICE,
  ESPRM_SCHEDULES_SERVICE,
} from "@shared/utils/constants";
import { isRmngStackSdkId } from "@config/sdk.identifiers";

export type DeviceServiceType =
  | typeof ESPRM_SCENES_SERVICE
  | typeof ESPRM_SCHEDULES_SERVICE;
export type DeviceSelectionIdentifier = "scene" | "schedule";

/**
 * Hook for managing device selection logic in scene/schedule creation
 * @param identifier - "scene" or "schedule" to determine which context to use
 * @returns View model containing devices, handlers, and computed values
 */
export const useDeviceSelection = (
  identifier: DeviceSelectionIdentifier = "scene",
) => {
  const router = useRouter();
  const { store } = useCDF();

  // Get the appropriate context based on identifier
  const sceneContext = useScene();
  const scheduleContext = useSchedule();

  const context = identifier === "scene" ? sceneContext : scheduleContext;
  const activeAdaptorIdentifier = store.getActiveAdaptorIdentifier();
  const allowOfflineForSchedule =
    identifier === "schedule" &&
    isRmngStackSdkId(activeAdaptorIdentifier);
  const serviceType =
    identifier === "scene" ? ESPRM_SCENES_SERVICE : ESPRM_SCHEDULES_SERVICE;
  const paramsRoute =
    identifier === "scene"
      ? "/(scene)/SceneDeviceParamsSelection"
      : "/(schedule)/ScheduleDeviceParamsSelection";

  const {
    checkDeviceDisabled,
    checkActionExists,
    setSelectedDevice,
    getActionValue,
    deleteAction,
  } = context;

  const [deviceData, setDeviceData] = useState<
    {
      node: ESPCDFNode;
      device: ESPCDFDevice;
      isMaxSceneReached: boolean;
    }[]
  >([]);

  // Fetch support nodes with devices from home based on service type
  useEffect(() => {
    const home = store.getCurrentHome();
    if (!home) return;

    // Determine which function to call based on service type
    const fetchDevices = async () => {
      try {
        if (serviceType === ESPRM_SCENES_SERVICE) {
          if (!home.getSceneCapableDevices) return;
          const deviceData = await home.getSceneCapableDevices();
          setDeviceData(deviceData);
        } else if (serviceType === ESPRM_SCHEDULES_SERVICE) {
          if (!home.getScheduleCapableDevices) return;
          const deviceData = await home.getScheduleCapableDevices();
          setDeviceData(deviceData);
        }
      } catch (error) {
        console.error(`Error fetching ${serviceType} support nodes:`, error);
        setDeviceData([]);
      }
    };

    fetchDevices();
  }, [store, serviceType]);

  /**
   * Builds device selection data from support nodes
   * Adds isSelected state based on current context (scene or schedule)
   */
  const devices = useMemo(() => {
    if (!deviceData.length) return [];

    // Add isSelected state to each device
    if (identifier === "schedule") {
      const allDevices: ScheduleDeviceSelectionData[] = deviceData.map(
        (item) => ({
          node: item.node,
          device: item.device,
          isSelected: checkActionExists(item.node.id, item.device.name).exist,
          isMaxScheduleReached: item.isMaxSceneReached,
        }),
      );
      return sortDevicesByConnectivity(
        allDevices as unknown as DeviceSelectionData[],
      ) as unknown as ScheduleDeviceSelectionData[];
    } else {
      const allDevices: DeviceSelectionData[] = deviceData.map((item) => ({
        node: item.node,
        device: item.device,
        isSelected: checkActionExists(item.node.id, item.device.name).exist,
        isMaxSceneReached: item.isMaxSceneReached,
      }));
      return sortDevicesByConnectivity(allDevices);
    }
  }, [deviceData, checkActionExists, identifier]);

  /**
   * Filtered list of selected devices
   */
  const selectedDevices = useMemo(() => {
    return devices.filter((device) => device.isSelected);
  }, [devices]);

  /**
   * Filtered list of non-selected devices
   */
  const nonSelectedDevices = useMemo(() => {
    return devices.filter((device) => !device.isSelected);
  }, [devices]);

  /**
   * Handles individual device selection
   * @param device - Device to select
   */
  const handleDeviceSelect = (
    device: DeviceSelectionData | ScheduleDeviceSelectionData,
  ) => {
    if (!allowOfflineForSchedule && !device.node.connectivityStatus?.isConnected) {
      return;
    }

    // Save the selected device to context
    setSelectedDevice({
      nodeId: device.node.id,
      deviceName: device.device.name,
      displayName: device.device.displayName ?? "",
    });

    // Navigate to parameter selection screen
    router.push(paramsRoute as any);
  };

  /**
   * Handles device deletion
   * @param device - Device to delete
   */
  const handleDeviceDelete = (
    device: DeviceSelectionData | ScheduleDeviceSelectionData,
  ) => {
    deleteAction(device.node.id, device.device.name);
  };

  /**
   * Gets actions for a device
   * @param device - Device to get actions for
   * @returns Record of parameter names to values
   */
  const getDeviceActionsForDevice = (
    device: DeviceSelectionData,
  ): Record<string, any> => {
    return getDeviceActions(device, checkActionExists, getActionValue);
  };

  /**
   * Gets device action values for display (schedule-specific)
   * @param device - Device to get action values for
   * @returns Record of parameter names to values
   */
  const getDeviceActionValues = (
    device: ScheduleDeviceSelectionData,
  ): Record<string, any> => {
    if (!device.isSelected) return {};

    return (
      device.device.params
        ?.filter(
          (param) =>
            checkActionExists(device.node.id, device.device.name, param.name)
              .exist,
        )
        ?.reduce(
          (acc, param) => {
            acc[param.name] = getActionValue(
              device.node.id,
              device.device.name,
              param.name,
            );
            return acc;
          },
          {} as Record<string, any>,
        ) || {}
    );
  };

  /**
   * Checks if device is disabled
   * @param device - Device to check
   * @returns Whether device is disabled
   */
  const isDeviceDisabled = (
    device: DeviceSelectionData | ScheduleDeviceSelectionData,
  ): boolean => {
    const isDeviceOnline = device.node.connectivityStatus?.isConnected || false;
    const maxReached =
      identifier === "schedule"
        ? (device as ScheduleDeviceSelectionData).isMaxScheduleReached
        : (device as DeviceSelectionData).isMaxSceneReached;
    return checkDeviceDisabled(
      device.node.id,
      null,
      allowOfflineForSchedule ? true : isDeviceOnline,
      maxReached,
    )
      .isDisabled;
  };

  /**
   * Checks if device is online
   * @param device - Device to check
   * @returns Whether device is online
   */
  const isDeviceOnline = (device: DeviceSelectionData): boolean => {
    return device.node.connectivityStatus?.isConnected || false;
  };

  return {
    devices,
    selectedDevices,
    nonSelectedDevices,
    handleDeviceSelect,
    handleDeviceDelete,
    getDeviceActionsForDevice,
    getDeviceActionValues,
    isDeviceDisabled,
    isDeviceOnline,
    checkActionExists,
    checkDeviceDisabled,
  };
};
