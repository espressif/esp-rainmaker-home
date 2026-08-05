/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { observer } from "mobx-react-lite";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { useEventDeviceSelection } from "@features/automation/hooks";
import { Header, ScreenWrapper } from "@shared/components";
import {
  EventDeviceSelectionDeviceItem,
  EventDeviceSelectionContent,
} from "@features/automation/components";
import type { DeviceSelectionData } from "@src/types/global";

/**
 * EventDeviceSelection Screen – UI / presentation layer.
 * Business logic in useEventDeviceSelection and utils.
 * Handles navigation and translations; hook returns structured results.
 */
export const EventDeviceSelectionScreen = observer(() => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isEditingEvent } = useLocalSearchParams<{
    isEditingEvent?: string;
  }>();

  const {
    currentEventInfo,
    currentEventDevice,
    selectedDevices,
    nonSelectedDevices,
    selectDevice,
  } = useEventDeviceSelection({ isEditingEvent });

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
      const isCurrentEventDevice =
        !!currentEventDevice &&
        currentEventDevice.device.name === device.device.name &&
        currentEventDevice.node.id === device.node.id;

      return (
        <EventDeviceSelectionDeviceItem
          key={`${device.node.id}-${index}`}
          device={device}
          currentEventInfo={currentEventInfo}
          isCurrentEventDevice={!!isCurrentEventDevice}
          onPress={() => handleDeviceSelect(device)}
        />
      );
    },
    [currentEventInfo, currentEventDevice, handleDeviceSelect],
  );

  const selectedSectionTitle = t(
    "automation.eventDeviceSelection.selectedDevice",
  );
  const availableSectionTitle =
    selectedDevices.length === 0
      ? t("automation.eventDeviceSelection.selectDevice")
      : t("automation.eventDeviceSelection.selectDifferentDevice");

  return (
    <>
      <Header
        label={t("automation.eventDeviceSelection.title")}
        showBack={true}
      />
      <ScreenWrapper
        style={globalStyles.automationScreenContainer}
        qaId="screen_wrapper_event_device_selection"
      >
        <EventDeviceSelectionContent
          selectedDevices={selectedDevices}
          nonSelectedDevices={nonSelectedDevices}
          selectedSectionTitle={selectedSectionTitle}
          availableSectionTitle={availableSectionTitle}
          renderDeviceItem={renderDeviceItem}
          qaId="event_device_selection"
        />
      </ScreenWrapper>
    </>
  );
});
