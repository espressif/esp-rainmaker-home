/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
} from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Icons
import { X, Plus } from "lucide-react-native";

// SDK
import type { ESPRMNode } from "@espressif/rainmaker-base-sdk";
import type { ScheduleDeviceSelectionData } from "@/types/global";

// Hooks
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCDF } from "@/hooks/useCDF";
import { observer } from "mobx-react-lite";
import { useSchedule } from "@/context/schedules.context";

// Components
import {
  Header,
  ScreenWrapper,
  DeviceAction,
  ActionButton,
} from "@/components";

// Utils
import { deepClone } from "@/utils/common";
import { ESPRM_SCHEDULES_SERVICE } from "@/utils/constants";
import { testProps } from "@/utils/testProps";

/**
 * ScheduleDeviceSelection Component
 *
 * A screen component that allows users to select devices for creating schedules.
 * It displays available devices with their selection state and online status.
 *
 * Features:
 * - Lists all available devices
 * - Allows device selection/deselection
 * - Handles online/offline device states
 * - Shows device connectivity status
 * - Simple device list without parameter conflicts
 */
const ScheduleDeviceSelection = observer(() => {
  // Hooks
  const router = useRouter();
  const { t } = useTranslation();
  const { store } = useCDF();
  const {
    checkDeviceDisabled,
    checkActionExists,
    setSelectedDevice,
    getActionValue,
    deleteAction,
    state,
  } = useSchedule();

  /**
   * Sorts devices by connectivity status
   * Online devices appear before offline ones
   * @param devices - Device list to sort
   * @returns Sorted device list
   */
  const sortDevicesByConnectivity = (
    devices: ScheduleDeviceSelectionData[]
  ): ScheduleDeviceSelectionData[] => {
    return devices.sort((a, b) => {
      const aOnline = a.node.connectivityStatus?.isConnected ?? false;
      const bOnline = b.node.connectivityStatus?.isConnected ?? false;
      return bOnline === aOnline ? 0 : bOnline ? 1 : -1;
    });
  };

  /**
   * Handles individual device selection
   * @param device - The device to select
   */
  const handleDeviceSelect = (device: ScheduleDeviceSelectionData) => {
    if (!device.node.connectivityStatus?.isConnected) {
      return;
    }

    // Save the selected device to context
    setSelectedDevice({
      nodeId: device.node.id,
      deviceName: device.device.name,
      displayName: device.device.displayName,
    });

    // Navigate to parameter selection screen
    router.push("/(schedule)/ScheduleDeviceParamsSelection");
  };

  const devices = useMemo(() => {
    const home = store.groupStore._groupsByID[store.groupStore.currentHomeId];
    const nodeList = store?.nodeStore?.nodeList as ESPRMNode[] | undefined;
    if (!nodeList) return [];

    const scheduleNodes = nodeList.filter(
      (node) =>
        home.nodes?.includes(node.id) &&
        node.nodeConfig?.services?.some(
          (service) => service.type === ESPRM_SCHEDULES_SERVICE
        )
    );

    // Extract devices from each node
    const allDevices: ScheduleDeviceSelectionData[] = [];

    scheduleNodes.forEach((node) => {
      const devices = node.nodeConfig?.devices ?? [];
      const schedule = node.nodeConfig?.services?.find(
        (service) => service.type === ESPRM_SCHEDULES_SERVICE
      )?.params[0] as any;

      const isMaxScheduleReached =
        schedule &&
        schedule.bounds?.max &&
        schedule.bounds.max == schedule.value.length;

      devices
        .filter((device) => device.params && device.params.length > 0)
        .forEach((device) => {
          allDevices.push({
            node: deepClone(node),
            device: deepClone(device),
            isSelected: checkActionExists(node.id, device.name).exist,
            isMaxScheduleReached,
          });
        });
    });

    // Sort devices by connectivity and set state
    const sortedDevices = sortDevicesByConnectivity(allDevices);

    return sortedDevices;
  }, [store?.nodeStore?.nodeList, state.actions, state.forceUpdateUI]);

  const selectedDevices = useMemo(() => {
    return devices.filter((device) => device.isSelected);
  }, [devices]);

  const nonSelectedDevices = useMemo(() => {
    return devices.filter((device) => !device.isSelected);
  }, [devices]);

  const handleDeviceDelete = (device: ScheduleDeviceSelectionData) => {
    deleteAction(device.node.id, device.device.name);
  };

  /**
   * Renders a device item using DeviceAction component
   * @param device - Device to render
   * @param deviceIndex - Index of the device
   */
  const renderDeviceItem = (
    device: ScheduleDeviceSelectionData,
    deviceIndex: number
  ) => {
    const isDeviceOnline = device.node.connectivityStatus?.isConnected || false;
    const isDeviceDisabled = checkDeviceDisabled(
      device.node.id,
      null,
      isDeviceOnline,
      device.isMaxScheduleReached
    ).isDisabled;

    return (
      <View
        key={`${device.node.id}-${deviceIndex}`}
        style={[
          globalStyles.sceneDeviceSection,
          !isDeviceOnline && globalStyles.deviceCardDisabled,
          isDeviceDisabled && globalStyles.deviceCardDisabled,
        ]}
      >
        <DeviceAction
          device={device.device.type}
          displayDeviceName={device.device.displayName}
          actions={
            device.isSelected
              ? device.device.params
                  ?.filter(
                    (param) =>
                      checkActionExists(
                        device.node.id,
                        device.device.name,
                        param.name
                      ).exist
                  )
                  ?.reduce((acc, param) => {
                    acc[param.name] = getActionValue(
                      device.node.id,
                      device.device.name,
                      param.name
                    );
                    return acc;
                  }, {} as Record<string, any>) || {}
              : {}
          }
          onPress={() => !isDeviceDisabled && handleDeviceSelect(device)}
          rightSlot={
            device.isSelected && (
              <Pressable
                style={{
                  padding: tokens.spacing._10,
                }}
                onPress={() => !isDeviceDisabled && handleDeviceDelete(device)}
              >
                <X size={16} color={tokens.colors.red} />
              </Pressable>
            )
          }
          badgeLable={
            isDeviceDisabled &&
            (isDeviceOnline ? (
              <Text style={[globalStyles.fontXs, globalStyles.textWarning]}>
                {t("schedule.deviceSelection.maxScheduleReached")}
              </Text>
            ) : (
              !isDeviceOnline && (
                <Text style={[globalStyles.fontXs, globalStyles.textGray]}>
                  {t("layout.shared.offline")}
                </Text>
              )
            ))
          }
        />
      </View>
    );
  };

  return (
    <>
      <Header label={t("schedule.deviceSelection.title")} showBack={true} />
      <ScreenWrapper
        style={{
          ...globalStyles.container,
          padding: 0,
        }}
      >
        {/* Main Content */}
        {devices.length === 0 ? (
          <View
            style={[
              globalStyles.sceneEmptyStateContainer,
              {
                justifyContent: "center",
              },
            ]}
          >
            <View style={globalStyles.sceneEmptyStateIconContainer}>
              <Pressable
                onPress={() => router.push("/(device)/AddDeviceSelection")}
              >
                <Plus size={35} color={tokens.colors.primary} />
              </Pressable>
            </View>
            <Text style={globalStyles.emptyStateTitle}>
              {t("schedule.deviceSelection.noDevicesAvailable")}
            </Text>
          </View>
        ) : (
          <ScrollView
            {...testProps("scroll_schedule_devices")}
            style={{
              flex: 1,
              marginBottom: 80,
            }}
          >
            {/* Device List */}
            {selectedDevices.length > 0 && (
              <View
                style={{
                  padding: tokens.spacing._15,
                  paddingBottom: 0,
                }}
              >
                <View style={{ marginBottom: tokens.spacing._10 }}>
                  <Text
                    style={[
                      globalStyles.fontSm,
                      globalStyles.fontMedium,
                      globalStyles.textPrimary,
                    ]}
                  >
                    {t("schedule.deviceSelection.selectedDevices")}
                  </Text>
                </View>
                {selectedDevices.map((device, index) =>
                  renderDeviceItem(device, index)
                )}
              </View>
            )}

            {nonSelectedDevices.length > 0 && (
              <View style={{ flex: 1, padding: tokens.spacing._15 }}>
                <View style={{ marginBottom: tokens.spacing._10 }}>
                  <Text
                    style={[
                      globalStyles.fontSm,
                      globalStyles.fontMedium,
                      globalStyles.textPrimary,
                    ]}
                  >
                    {selectedDevices.length === 0
                      ? t("schedule.deviceSelection.selectDevices")
                      : t("schedule.deviceSelection.selectMore")}{" "}
                    {}
                  </Text>
                </View>
                {nonSelectedDevices.map((device, index) =>
                  renderDeviceItem(device, index)
                )}
              </View>
            )}
          </ScrollView>
        )}

        {/* Footer Actions */}
        {devices.length > 0 && (
          <View style={[globalStyles.sceneFooter]}>
            <ActionButton
              qaId="button_done_schedule_selection"
              onPress={() => router.back()}
              disabled={selectedDevices.length === 0}
              variant="secondary"
            >
              <View>
                <Text style={[globalStyles.fontMedium]}>
                  {t("layout.shared.done")}
                </Text>
              </View>
            </ActionButton>
          </View>
        )}
      </ScreenWrapper>
    </>
  );
});

export default ScheduleDeviceSelection;
