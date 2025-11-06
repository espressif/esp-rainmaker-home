/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// React Native Imports
import {useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Icons
import { X, Plus } from "lucide-react-native";
// SDK
import type { ESPRMDevice, ESPRMNode } from "@espressif/rainmaker-base-sdk";

// Hooks
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCDF } from "@/hooks/useCDF";
import { observer } from "mobx-react-lite";
import { useScene } from "@/context/scenes.context";

// Components
import {
  Header,
  ScreenWrapper,
  DeviceAction,
  ActionButton,
} from "@/components";

// Utils
import { deepClone } from "@/utils/common";
import { ESPRM_SCENES_SERVICE } from "@/utils/constants";
import { testProps } from "@/utils/testProps";

interface DeviceSelectionData {
  node: ESPRMNode;
  device: ESPRMDevice;
  isSelected: boolean;
  isMaxSceneReached: boolean;
}

/**
 * DeviceSelection Component
 *
 * A screen component that allows users to select devices for creating scenes.
 * It displays available devices with their selection state and online status.
 *
 * Features:
 * - Lists all available devices
 * - Allows device selection/deselection
 * - Handles online/offline device states
 * - Shows device connectivity status
 * - Simple device list without parameter conflicts
 */
const DeviceSelection = observer(() => {
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
  } = useScene();

  /**
   * Sorts devices by connectivity status
   * Online devices appear before offline ones
   * @param devices - Device list to sort
   * @returns Sorted device list
   */
  const sortDevicesByConnectivity = (
    devices: DeviceSelectionData[]
  ): DeviceSelectionData[] => {
    return devices.sort((a, b) => {
      const aOnline = a.node.connectivityStatus?.isConnected ?? false;
      const bOnline = b.node.connectivityStatus?.isConnected ?? false;
      return bOnline === aOnline ? 0 : bOnline ? 1 : -1;
    });
  };

  /**
   * Handles individual device selection
   * @param deviceIndex - Index of the device
   */
  const handleDeviceSelect = (device: DeviceSelectionData) => {
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
    router.push("/(scene)/DeviceParamsSelection");
  };

  const devices = useMemo(() => {
    const home = store.groupStore._groupsByID[store.groupStore.currentHomeId];
    const nodeList = store?.nodeStore?.nodeList as ESPRMNode[] | undefined;
    if (!nodeList) return [];

    const sceneNodes = nodeList.filter(
      (node) =>
        home.nodes?.includes(node.id) &&
        node.nodeConfig?.services?.some(
          (service) => service.type === ESPRM_SCENES_SERVICE
        )
    );

    // Extract devices from each node
    const allDevices: DeviceSelectionData[] = [];

    sceneNodes.forEach((node) => {
      const devices = node.nodeConfig?.devices ?? [];
      const scene = node.nodeConfig?.services?.find(
        (service) => service.type === ESPRM_SCENES_SERVICE
      )?.params[0] as any;

      const isMaxSceneReached =
        scene && scene.bounds?.max && scene.bounds.max == scene.value.length;

      devices
        .filter((device) => device.params && device.params.length > 0)
        .forEach((device) => {
          allDevices.push({
            node: deepClone(node),
            device: deepClone(device),
            isSelected: checkActionExists(node.id, device.name).exist,
            isMaxSceneReached,
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

  const handleDeviceDelete = (device: DeviceSelectionData) => {
    deleteAction(device.node.id, device.device.name);
  };

  /**
   * Renders a device item using DeviceAction component
   * @param device - Device to render
   * @param deviceIndex - Index of the device
   */
  const renderDeviceItem = (
    device: DeviceSelectionData,
    deviceIndex: number
  ) => {
    const isDeviceOnline = device.node.connectivityStatus?.isConnected || false;
    const isDeviceDisabled = checkDeviceDisabled(
      device.node.id,
      null,
      isDeviceOnline,
      device.isMaxSceneReached
    ).isDisabled;

    return (
      <View
        {...testProps("view_device_item")}
        key={`${device.node.id}-${deviceIndex}`}
        style={[
          globalStyles.sceneDeviceSection,
          !isDeviceOnline && globalStyles.deviceCardDisabled,
          isDeviceDisabled && globalStyles.deviceCardDisabled,
        ]}
      >
        <DeviceAction
          qaId="device_action_item"
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
                {...testProps("button_delete_selected_device")}
                style={{
                  padding: tokens.spacing._10,
                }}
                onPress={() => !isDeviceDisabled && handleDeviceDelete(device)}
              >
                <X {...testProps("icon_delete_selected_device")} size={16} color={tokens.colors.red} />
              </Pressable>
            )
          }
          badgeLable={
            isDeviceDisabled &&
            (isDeviceOnline ? (
              <Text {...testProps("text_max_scene_reached")} style={[globalStyles.fontXs, globalStyles.textWarning]}>
                {t("scene.deviceSelection.maxSceneReached")}
              </Text>
            ) : (
              !isDeviceOnline && (
                <Text {...testProps("text_offline")} style={[globalStyles.fontXs, globalStyles.textGray]}>
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
      <Header label={t("scene.deviceSelection.title")} showBack={true} qaId="header_scene_device_selection" />
      <ScreenWrapper
        style={{
          ...globalStyles.container,
          padding: 0,
        }}
        qaId="screen_wrapper_scene_device_selection"
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
            <View {...testProps("view_empty_devices_selection")} style={globalStyles.sceneEmptyStateIconContainer}>
              <Pressable {...testProps("button_add_device_selection")} onPress={() => router.push("/(device)/AddDeviceSelection")}>
                <Plus size={35} color={tokens.colors.primary} />
              </Pressable>
            </View>
            <Text {...testProps("text_no_devices_available")} style={globalStyles.emptyStateTitle}>
              {t("scene.deviceSelection.noDevicesAvailable")}
            </Text>
          </View>
        ) : (
          <ScrollView
            {...testProps("scroll_scene_devices")}
            style={{
              flex: 1,
              marginBottom: 80
            }}
          >
            {/* Device List */}
            {selectedDevices.length > 0 && (
              <View
                {...testProps("view_selected_devices")}
                style={{
                  padding: tokens.spacing._15,
                  paddingBottom: 0,
                }}
              >
                <View style={{ marginBottom: tokens.spacing._10 }}>
                  <Text
                    {...testProps("text_selected_devices")}
                    style={[
                      globalStyles.fontSm,
                      globalStyles.fontMedium,
                      globalStyles.textPrimary,
                    ]}
                  >
                    {t("scene.deviceSelection.selectedDevices")}
                  </Text>
                </View>
                {selectedDevices.map((device, index) =>
                  renderDeviceItem(device, index)
                )}
              </View>
            )}

            {nonSelectedDevices.length > 0 && (
              <View {...testProps("view_non_selected_devices")} style={{ flex: 1, padding: tokens.spacing._15 }}>
                <View style={{ marginBottom: tokens.spacing._10 }}>
                  <Text
                    {...testProps("text_select_devices")}
                    style={[
                      globalStyles.fontSm,
                      globalStyles.fontMedium,
                      globalStyles.textPrimary,
                    ]}
                  >
                    {selectedDevices.length === 0
                      ? t("scene.deviceSelection.selectDevices")
                      : t("scene.deviceSelection.selectMore")}{" "}
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
              qaId="button_done_scene_selection"
              onPress={() => router.back()}
              disabled={selectedDevices.length === 0}
              variant="secondary"
            >
              {selectedDevices.length === 0 ? (
                <ActivityIndicator size="small" color={tokens.colors.white} />
              ) : (
                <View>
                  <Text style={[globalStyles.fontMedium]}>
                    {t("layout.shared.done")}
                  </Text>
                </View>
              )}
            </ActionButton>
          </View>
        )}
      </ScreenWrapper>
    </>
  );
});

export default DeviceSelection;
