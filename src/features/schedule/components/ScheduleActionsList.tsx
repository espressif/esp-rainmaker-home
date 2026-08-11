/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, ScrollView } from "react-native";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import ScheduleActions from "./ScheduleActions";
import ScheduleActionsHeader from "./ScheduleActionsHeader";
import { testProps } from "@shared/utils/testProps";
import type { ESPCDFDevice } from "@store";

interface ScheduleAction {
  nodeId: string;
  device: ESPCDFDevice;
  displayDeviceName: string;
  action: any;
}

interface ScheduleActionsListProps {
  scheduleActions: ScheduleAction[];
  onAddDeviceAction: () => void;
}

/**
 * ScheduleActionsList Component
 *
 * Renders the actions section header and a scrollable list of selected
 * device actions. Empty state is owned by the create-schedule screen stack.
 */
export const ScheduleActionsList = ({
  scheduleActions,
  onAddDeviceAction,
}: ScheduleActionsListProps) => {
  const hasActions = scheduleActions.length > 0;

  return (
    <View
      style={[
        globalStyles.section,
        hasActions && globalStyles.scheduleActionsContainer,
      ]}
    >
      <ScheduleActionsHeader onAddPress={onAddDeviceAction} />

      {hasActions && (
        <ScrollView
          {...testProps("scroll_schedule_actions")}
          style={globalStyles.scheduleActionsDeviceList}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={globalStyles.scheduleActionsDeviceListContent}
        >
          {scheduleActions.map((action: ScheduleAction) =>
            action.device ? (
              <ScheduleActions
                key={action.nodeId + action.device.name}
                device={action.device}
                displayDeviceName={action.displayDeviceName}
                action={action.action}
                onActionPress={onAddDeviceAction}
                nodeId={action.nodeId}
              />
            ) : null,
          )}
        </ScrollView>
      )}
    </View>
  );
};
