/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, Pressable } from "react-native";
import { Plus, Replace } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import AutomationDeviceCard from "../AutomationDeviceCard";
import { testProps } from "@shared/utils/testProps";
import { createAutomationStyles as styles } from "../../theme/createAutomationStyles";
import type { CreateAutomationEventInfo } from "@features/automation/utils/automationManagement";

export interface CreateAutomationEventsSectionProps {
  sectionLabel: string;
  hasEvents: boolean;
  eventInfo: CreateAutomationEventInfo | null;
  eventDevice: { type: string; name: string } | null;
  eventDisplayName: string;
  disabled?: boolean;
  onAddEvent: () => void;
}

/**
 * Renders the create automation events section header and event card when present.
 */
export const CreateAutomationEventsSection: React.FC<
  CreateAutomationEventsSectionProps
> = ({
  sectionLabel,
  hasEvents,
  eventInfo,
  eventDevice,
  eventDisplayName,
  disabled = false,
  onAddEvent,
}) => {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text {...testProps("text_label_event")} style={styles.sectionLabel}>
          {sectionLabel}
        </Text>
        <Pressable
          {...testProps("button_add_event")}
          onPress={disabled ? undefined : onAddEvent}
          style={[styles.addButton, disabled && styles.disabledButton]}
          disabled={disabled}
        >
          {hasEvents ? (
            <Replace
              size={16}
              color={
                disabled
                  ? tokens.colors.text_secondary
                  : tokens.colors.text_primary
              }
            />
          ) : (
            <Plus
              size={16}
              color={
                disabled
                  ? tokens.colors.text_secondary
                  : tokens.colors.text_primary
              }
            />
          )}
        </Pressable>
      </View>
      {hasEvents && eventInfo && (
        <View style={styles.eventSummaryContainer}>
          <AutomationDeviceCard
            key={`event-${eventInfo.deviceName}`}
            device={
              eventDevice ?? { type: "switch", name: eventInfo.deviceName }
            }
            displayDeviceName={eventDisplayName}
            type="event"
            eventConditions={{
              [eventInfo.parameter]: {
                condition: eventInfo.condition,
                value: eventInfo.value,
              },
            }}
            onPress={disabled ? () => {} : onAddEvent}
            qaId={`automation_event_${eventInfo.deviceName}`}
          />
        </View>
      )}
    </View>
  );
};
