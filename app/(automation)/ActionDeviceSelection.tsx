/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";
// Icons
import { X } from "lucide-react-native";
// CDF
import {
  ESPAutomationEvent,
  ESPAutomationConditionOperator,
  ESPRMNode,
} from "@espressif/rainmaker-base-cdf";
// Hooks
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCDF } from "@/hooks/useCDF";
import { observer } from "mobx-react-lite";
import { useAutomation } from "@/context/automation.context";
// Components
import {
  Header,
  ScreenWrapper,
  DeviceAction,
  ActionButton,
} from "@/components";
// Utils
import { deepClone } from "@/utils/common";
import { testProps } from "@/utils/testProps";
// Types
import { DeviceSelectionData } from "@/types/global";

/**
 * ActionDeviceSelection Component
 *
 * A screen component that allows users to select devices for automation actions.
 * It displays available devices that can be controlled when the automation triggers.
 *
 * Features:
 * - Lists all available devices for automation actions
 * - Allows device selection/deselection for actions
 * - Handles online/offline device states
 * - Shows device connectivity status
 * - Manages automation action device selection
 */
const ActionDeviceSelection = observer(() => {
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
  } = useAutomation();

  const { isEditingAction } = useLocalSearchParams();

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

    // Navigate to automation action parameter selection screen with edit flag
    router.push({
      pathname: "/(automation)/ActionDeviceParamSelection",
      params: {
        isEditingAction: isEditingAction || "false",
      },
    } as any);
  };

  const devices = useMemo(() => {
    const home = store.groupStore._groupsByID[store.groupStore.currentHomeId];
    const nodeList = store?.nodeStore?.nodeList as ESPRMNode[] | undefined;
    if (!nodeList) return [];

    const currentHomeNodes = nodeList.filter((node) =>
      home.nodes?.includes(node.id)
    );

    // Extract devices from each node
    const allDevices: DeviceSelectionData[] = [];

    currentHomeNodes.forEach((node) => {
      const devices = node.nodeConfig?.devices ?? [];

      devices
        .filter((device) => device.params && device.params.length > 0)
        .forEach((device) => {
          allDevices.push({
            node: deepClone(node),
            device: deepClone(device),
            isSelected: checkActionExists(node.id, device.name).exist,
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

  // Get event information for display
  const eventInfo = useMemo(() => {
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

  // Find the event device from the store to get display name
  const eventDevice = useMemo(() => {
    if (!eventInfo || !state.nodeId) return null;

    // Get the specific node using nodeId from automation context
    const node = store.nodeStore.nodesByID[state.nodeId];
    if (!node?.nodeConfig?.devices) return null;

    // Find the device in the node by matching device name
    const device = node.nodeConfig.devices.find(
      (d) => d.name === eventInfo.deviceName
    );

    return device || null;
  }, [eventInfo, state.nodeId, store.nodeStore.nodesByID]);

  // Render event summary card
  const renderEventSummary = () => {
    if (!eventInfo) return null;

    const getConditionLabel = (condition: ESPAutomationConditionOperator) => {
      switch (condition) {
        case ESPAutomationConditionOperator.EQUAL:
          return t("automation.conditions.equals");
        case ESPAutomationConditionOperator.NOT_EQUAL:
          return t("automation.conditions.notEquals");
        case ESPAutomationConditionOperator.GREATER_THAN:
          return t("automation.conditions.greaterThan");
        case ESPAutomationConditionOperator.LESS_THAN:
          return t("automation.conditions.lessThan");
        case ESPAutomationConditionOperator.GREATER_THAN_OR_EQUAL:
          return t("automation.conditions.greaterThanOrEqual");
        case ESPAutomationConditionOperator.LESS_THAN_OR_EQUAL:
          return t("automation.conditions.lessThanOrEqual");
        default:
          return condition;
      }
    };

    const getValueDisplay = (value: any) => {
      if (typeof value === "boolean") {
        return value
          ? t("automation.conditions.on")
          : t("automation.conditions.off");
      }
      return value?.toString() || "N/A";
    };

    return (
      <View {...testProps("view_event_summary_action")} style={styles.eventSummaryCard}>
        <View style={styles.eventSummaryHeader}>
          <Text {...testProps("text_event_summary_title")} style={styles.eventSummaryTitle}>
            {t("automation.actionDeviceSelection.eventSummary")}
          </Text>
        </View>
        <View style={styles.eventSummaryContent}>
          <Text style={styles.eventSummaryText}>
            <Text style={styles.eventSummaryLabel}>
              {t("automation.actionDeviceSelection.when")}
            </Text>
            <Text style={styles.eventSummaryDevice}>
              {" "}
              {eventDevice?.displayName || eventInfo.deviceName}
            </Text>
            <Text style={styles.eventSummaryParam}>
              {" "}
              {eventInfo.parameter}{" "}
            </Text>
            <Text style={styles.eventSummaryCondition}>
              {getConditionLabel(eventInfo.condition)}
            </Text>
            <Text style={styles.eventSummaryValue}>
              {" "}
              {getValueDisplay(eventInfo.value)}
            </Text>
          </Text>
        </View>
      </View>
    );
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
    const isDeviceDisabled = checkDeviceDisabled(isDeviceOnline).isDisabled;

    return (
      <View
        {...testProps("view_action_device_item")}
        key={`${device.node.id}-${deviceIndex}`}
        style={[
          globalStyles.sceneDeviceSection,
          !isDeviceOnline && globalStyles.deviceCardDisabled,
          isDeviceDisabled && globalStyles.deviceCardDisabled,
        ]}
      >
        <DeviceAction
          qaId="action_device_action_item"
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
                {...testProps("button_delete_selected_action_device")}
                style={{
                  padding: tokens.spacing._10,
                }}
                onPress={() => !isDeviceDisabled && handleDeviceDelete(device)}
              >
                <X {...testProps("icon_delete_selected_action_device")} size={16} color={tokens.colors.red} />
              </Pressable>
            )
          }
          badgeLable={
            !isDeviceOnline && (
              <Text {...testProps("text_offline_action")} style={[globalStyles.fontXs, globalStyles.textGray]}>
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
        label={t("automation.actionDeviceSelection.title")}
        showBack={true}
        qaId="header_action_device_selection"
      />
      <ScreenWrapper
        style={{
          ...globalStyles.container,
          padding: 0,
        }}
        qaId="screen_wrapper_action_device_selection"
      >
        {/* Event Summary */}
        {renderEventSummary()}

        {/* Main Content */}

        <ScrollView
          {...testProps("scroll_action_devices")}
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
                  {...testProps("text_selected_devices_action")}
                  style={[
                    globalStyles.fontSm,
                    globalStyles.fontMedium,
                    globalStyles.textPrimary,
                  ]}
                >
                  {t("automation.actionDeviceSelection.selectedDevices")}
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
                  {...testProps("text_select_devices_action")}
                  style={[
                    globalStyles.fontSm,
                    globalStyles.fontMedium,
                    globalStyles.textPrimary,
                  ]}
                >
                  {selectedDevices.length === 0
                    ? t("automation.actionDeviceSelection.selectDevices")
                    : t("automation.actionDeviceSelection.selectMore")}{" "}
                  {}
                </Text>
              </View>
              {nonSelectedDevices.map((device, index) =>
                renderDeviceItem(device, index)
              )}
            </View>
          )}
        </ScrollView>

        {/* Footer Actions */}
        {devices.length > 0 && (
          <View style={[globalStyles.sceneFooter]}>
            <ActionButton
              {...testProps("button_done_action_selection")}
              onPress={() => router.dismissTo("/(automation)/CreateAutomation")}
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

export default ActionDeviceSelection;

const styles = StyleSheet.create({
  eventSummaryCard: {
    margin: tokens.spacing._15,
    marginBottom: tokens.spacing._10,
    padding: tokens.spacing._15,
    backgroundColor: tokens.colors.bg1,
    borderRadius: tokens.radius.sm,
    borderWidth: tokens.border.defaultWidth,
    borderColor: tokens.colors.borderColor,
  },
  eventSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._5,
    marginBottom: tokens.spacing._10,
  },
  eventSummaryTitle: {
    fontSize: tokens.fontSize.sm,
  },
  eventSummaryContent: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  eventSummaryText: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text_primary,
    lineHeight: 22,
  },
  eventSummaryLabel: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text_secondary,
  },
  eventSummaryDevice: {
    fontSize: tokens.fontSize.sm,
  },
  eventSummaryParam: {
    fontSize: tokens.fontSize.sm,
  },
  eventSummaryCondition: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text_secondary,
    fontStyle: "italic",
  },
  eventSummaryValue: {
    fontSize: tokens.fontSize.sm,
  },
});
