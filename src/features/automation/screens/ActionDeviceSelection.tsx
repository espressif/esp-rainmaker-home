/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from "react";
import { View, Text } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { observer } from "mobx-react-lite";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import {
  getConditionLabel,
  getValueDisplay,
} from "@features/automation/utils/automationConditionUtils";
import { useActionDeviceSelection } from "@features/automation/hooks";
import { Header, ScreenWrapper, ActionButton } from "@shared/components";
import {
  EventDeviceSelectionContent,
  ActionDeviceSelectionEventSummary,
  ActionDeviceSelectionDeviceItem,
} from "@features/automation/components";
import type { DeviceSelectionData } from "@src/types/global";

/**
 * ActionDeviceSelection Screen – UI / presentation layer.
 * Business logic in useActionDeviceSelection and utils.
 * Handles navigation and translations; hook returns structured results.
 */
export const ActionDeviceSelectionScreen = observer(() => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isEditingAction } = useLocalSearchParams<{
    isEditingAction?: string;
  }>();

  const {
    devices,
    eventInfo,
    eventDevice,
    selectedDevices,
    nonSelectedDevices,
    selectDevice,
    deleteDevice,
    getDeviceActions,
  } = useActionDeviceSelection({ isEditingAction });

  const conditionLabel = eventInfo
    ? getConditionLabel(eventInfo.condition, t)
    : "";
  const valueDisplay = eventInfo ? getValueDisplay(eventInfo.value, t) : "";

  const handleDeviceSelect = useCallback(
    (device: DeviceSelectionData) => {
      const result = selectDevice(device);
      if (result.success && result.navigateParams) {
        router.push(result.navigateParams as any);
      }
    },
    [selectDevice, router],
  );

  const renderDeviceItem = useCallback(
    (device: DeviceSelectionData, index: number) => {
      const actions = getDeviceActions(device);

      return (
        <ActionDeviceSelectionDeviceItem
          key={`${device.node.id}-${index}`}
          device={device}
          actions={actions}
          onPress={() => handleDeviceSelect(device)}
          onDelete={() => deleteDevice(device)}
          showDelete={device.isSelected}
        />
      );
    },
    [getDeviceActions, handleDeviceSelect, deleteDevice],
  );

  const selectedSectionTitle = t(
    "automation.actionDeviceSelection.selectedDevices",
  );
  const availableSectionTitle =
    selectedDevices.length === 0
      ? t("automation.actionDeviceSelection.selectDevices")
      : t("automation.actionDeviceSelection.selectMore");

  const eventDeviceDisplayName =
    eventDevice?.displayName ?? eventInfo?.deviceName ?? "";

  return (
    <>
      <Header
        label={t("automation.actionDeviceSelection.title")}
        showBack={true}
        qaId="header_action_device_selection"
      />
      <ScreenWrapper
        style={globalStyles.automationScreenContainer}
        qaId="screen_wrapper_action_device_selection"
      >
        <ActionDeviceSelectionEventSummary
          eventInfo={eventInfo}
          eventDeviceDisplayName={eventDeviceDisplayName}
          conditionLabel={conditionLabel}
          valueDisplay={valueDisplay}
          titleLabel={t("automation.actionDeviceSelection.eventSummary")}
          whenLabel={t("automation.actionDeviceSelection.when")}
        />

        <EventDeviceSelectionContent
          selectedDevices={selectedDevices}
          nonSelectedDevices={nonSelectedDevices}
          selectedSectionTitle={selectedSectionTitle}
          availableSectionTitle={availableSectionTitle}
          renderDeviceItem={renderDeviceItem}
        />

        {devices.length > 0 && (
          <View style={globalStyles.sceneFooter}>
            <ActionButton
              qaId="button_done_action_selection"
              onPress={() => router.dismissTo("/(automation)/CreateAutomation")}
              variant="secondary"
            >
              <View>
                <Text style={globalStyles.fontMedium}>
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
