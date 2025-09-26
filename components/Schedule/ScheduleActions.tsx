/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceAction } from "@/components";
import { ScheduleActionProps } from "@/types/global";
import { useSchedule } from "@/context/schedules.context";

/**
 * ScheduleActions Component
 *
 * Renders a list of device actions for a schedule
 * Allows interaction with individual actions
 *
 * @param {string} device - Device name (e.g. "light")
 * @param {string} displayDeviceName - Display device name
 * @param {Record<string, any>} action - Action object
 * @param {Function} onActionPress - Handler for action press events
 */
const ScheduleActions = ({
  device,
  displayDeviceName,
  action,
  onActionPress,
  nodeId,
}: ScheduleActionProps) => {
  const { checkNodeOutOfSync } = useSchedule();
  const { isOutOfSync } = checkNodeOutOfSync(nodeId);

  return (
    <DeviceAction
      displayDeviceName={displayDeviceName}
      device={device.type}
      actions={action}
      onPress={() => onActionPress()}
      isOutOfSync={isOutOfSync}
    />
  );
};

export default ScheduleActions;
