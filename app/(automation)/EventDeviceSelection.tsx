/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from "react";
import { View, Text, ScrollView } from "react-native";
// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";
// CDF
import type {
  ESPRMNode,
  ESPAutomationEvent,
} from "@espressif/rainmaker-base-cdf";
// Hooks
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCDF } from "@/hooks/useCDF";
import { useAutomation } from "@/context/automation.context";
// Mobx observer
import { observer } from "mobx-react-lite";
// Components
import { Header, ScreenWrapper, DeviceAction } from "@/components";
// Utils
import { deepClone } from "@/utils/common";
// Types
import { DeviceSelectionData } from "@/types/global";

/**
 * EventDeviceSelection Component
 *
 * A screen component that allows users to select devices for creating automation events.
 * It displays available devices that can be used as event triggers.
 *
 * Features:
 * - Lists all available devices for events
 * - Allows device selection for event configuration
 * - Handles online/offline device states
 * - Shows device connectivity status
 * - Navigates to event parameter configuration
 */
const EventDeviceSelection = observer(() => {
  // Hooks
  const router = useRouter();
  const { t } = useTranslation();
  const { store } = useCDF();
  const { checkDeviceDisabled, setSelectedEventDevice, state } =
    useAutomation();

  const { isEditingEvent } = useLocalSearchParams();

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
   * Handles individual device selection for events
   * @param device - Device to select for event configuration
   */
  const handleDeviceSelect = (device: DeviceSelectionData) => {
    if (!device.node.connectivityStatus?.isConnected) {
      return;
    }

    // Save the selected device to context for event configuration
    setSelectedEventDevice({
      nodeId: device.node.id,
      deviceName: device.device.name,
      displayName: device.device.displayName,
    });

    // Navigate to event parameter selection screen with edit flag
    router.push({
      pathname: "/(automation)/EventDeviceParamSelection",
      params: {
        isEditingEvent: isEditingEvent || "false",
      },
    } as any);
  };

  // Get current event information for display when editing
  const currentEventInfo = useMemo(() => {
    if (!state.events || state.events.length === 0) return null;

    // For now, we only have one event for node parameter event
    const event = state.events[0];

    // Check if it's an ESPAutomationEvent (device parameter event)
    if (typeof event === "object" && event !== null && "deviceName" in event) {
      const automationEvent = event as ESPAutomationEvent;
      return {
        deviceName: automationEvent.deviceName,
        parameter: automationEvent.param,
        condition: automationEvent.check,
        value: automationEvent.value,
      };
    }

    return null;
  }, [state.events]);

  const devices = useMemo(() => {
    const home = store.groupStore._groupsByID[store.groupStore.currentHomeId];
    const nodeList = store?.nodeStore?.nodeList as ESPRMNode[] | undefined;
    if (!nodeList) return [];

    // Filter nodes that are in the current home
    const automationNodes = nodeList.filter((node) =>
      home.nodes?.includes(node.id)
    );

    // Extract devices from each node that can be used for events
    const allDevices: DeviceSelectionData[] = [];

    automationNodes.forEach((node) => {
      const devices = node.nodeConfig?.devices ?? [];
      devices
        .filter((device) => device.params && device.params.length > 0)
        .forEach((device) => {
          // Check if this device is currently selected for event
          const isSelected =
            currentEventInfo &&
            node.id === state.nodeId &&
            device.name === currentEventInfo.deviceName;

          allDevices.push({
            node: deepClone(node),
            device: deepClone(device),
            isSelected: !!isSelected,
          });
        });
    });

    // Sort devices by connectivity
    const sortedDevices = sortDevicesByConnectivity(allDevices);
    return sortedDevices;
  }, [store?.nodeStore?.nodeList, state.forceUpdateUI, currentEventInfo]);

  // Find the device that matches the current event for highlighting
  const currentEventDevice = useMemo(() => {
    if (!currentEventInfo) return null;
    return devices.find(
      (device) =>
        device.node.id === state.nodeId &&
        device.device.name === currentEventInfo.deviceName
    );
  }, [currentEventInfo, devices]);

  const selectedDevices = useMemo(() => {
    return devices.filter((device) => device.isSelected);
  }, [devices]);

  const nonSelectedDevices = useMemo(() => {
    return devices.filter((device) => !device.isSelected);
  }, [devices]);

  /**
   * Renders a device item for event selection
   * @param device - Device to render
   * @param deviceIndex - Index of the device
   */
  const renderDeviceItem = (
    device: DeviceSelectionData,
    deviceIndex: number
  ) => {
    const isDeviceOnline = device.node.connectivityStatus?.isConnected || false;
    const isDeviceDisabled = checkDeviceDisabled(isDeviceOnline).isDisabled;

    // Check if this device has the current event
    const hasCurrentEvent =
      currentEventDevice &&
      currentEventDevice.device.name === device.device.name &&
      currentEventDevice.node.id === device.node.id;

    // Prepare event conditions for display if this device has the current event
    const eventConditions =
      hasCurrentEvent && currentEventInfo
        ? {
            [currentEventInfo.parameter]: {
              condition: currentEventInfo.condition,
              value: currentEventInfo.value,
            },
          }
        : undefined;

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
          actions={{}} // No actions needed for event device selection
          onPress={() => !isDeviceDisabled && handleDeviceSelect(device)}
          eventConditions={eventConditions}
          isEventMode={!!hasCurrentEvent}
          badgeLable={
            !isDeviceOnline && (
              <Text style={[globalStyles.fontXs, globalStyles.textGray]}>
                {t("layout.shared.offline")}
              </Text>
            )
          }
        />
      </View>
    );
  };

  return (
    <>
      <Header
        label={t("automation.eventDeviceSelection.title")}
        showBack={true}
      />
      <ScreenWrapper
        style={{
          ...globalStyles.container,
          padding: 0,
        }}
      >
        {/* Main Content */}
        <ScrollView
          style={{
            flex: 1,
            marginBottom: 80,
          }}
        >
          {/* Selected Event Device */}
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
                  {t("automation.eventDeviceSelection.selectedDevice")}
                </Text>
              </View>
              {selectedDevices.map((device, index) =>
                renderDeviceItem(device, index)
              )}
            </View>
          )}

          {/* Available Devices */}
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
                    ? t("automation.eventDeviceSelection.selectDevice")
                    : t(
                        "automation.eventDeviceSelection.selectDifferentDevice"
                      )}
                </Text>
              </View>
              {nonSelectedDevices.map((device, index) =>
                renderDeviceItem(device, index)
              )}
            </View>
          )}
        </ScrollView>
      </ScreenWrapper>
    </>
  );
});

export default EventDeviceSelection;
