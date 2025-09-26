/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import DeviceAction from "../ParamControls/DeviceAction";
import { observer } from "mobx-react-lite";
import { AutomationDeviceCardProps } from "@/types/global";

/**
 * AutomationDeviceCard Component
 *
 * Unified component that renders both automation events and actions
 * Uses type prop to determine behavior and display
 *
 * @param {Record<string, any>} device - Device object with type and name
 * @param {string} displayDeviceName - Display device name
 * @param {"event" | "action"} type - Type of automation component (event or action)
 * @param {Record<string, any>} actions - Action object (for action type)
 * @param {Record<string, { condition: string; value: any }>} eventConditions - Event conditions (for event type)
 * @param {Function} onPress - Handler for press events
 */
const AutomationDeviceCard = ({
  device,
  displayDeviceName,
  type,
  actions = {},
  eventConditions,
  onPress,
}: AutomationDeviceCardProps) => {
  return (
    <DeviceAction
      displayDeviceName={displayDeviceName}
      device={device.type}
      actions={type === "action" ? actions : {}}
      eventConditions={type === "event" ? eventConditions : undefined}
      isEventMode={type === "event"}
      onPress={onPress}
    />
  );
};

export default observer(AutomationDeviceCard);
