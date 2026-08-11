/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { observer } from "mobx-react-lite";
import type { ESPCDFAutomation } from "@store";
import { tokens } from "@shared/theme/tokens";
import { useCDF } from "@shared/hooks/useCDF";
import { testProps } from "@shared/utils/testProps";
import {
  getAutomationActionDescription,
  getAutomationEventSummary,
} from "@features/automation/utils/automationSummaryUtils";

export interface AutomationWhenSetSummaryProps {
  /** Automation whose When / Set summary is shown */
  automation: ESPCDFAutomation;
  /** Optional test id prefix for QA */
  qaId?: string;
}

/**
 * Renders the When (condition tag) and Set summary for an automation list card.
 * Display-only; does not mutate automation create/edit state.
 */
const AutomationWhenSetSummary: React.FC<AutomationWhenSetSummaryProps> = ({
  automation,
  qaId,
}) => {
  const { t } = useTranslation();
  const { store } = useCDF();

  /**
   * Gets device display name from store using nodeId and device name.
   * @param nodeId - Node ID from automation
   * @param deviceName - Device name from automation event/action
   * @returns Device display name or fallback to device name
   */
  const getDeviceDisplayName = useCallback(
    (nodeId: string, deviceName: string) => {
      try {
        const node = store?.nodeStore?.nodesByIDMap?.[nodeId];
        if (!node?.devices) {
          return deviceName;
        }

        const device = node.devices.find(
          (entry) => entry.name === deviceName,
        );

        return device?.displayName || deviceName;
      } catch (error) {
        console.error(
          "[AutomationWhenSetSummary] Error getting device display name:",
          error,
        );
        return deviceName;
      }
    },
    [store],
  );

  const eventSummary = getAutomationEventSummary(
    automation,
    getDeviceDisplayName,
    t,
  );
  const actionDescription = getAutomationActionDescription(
    automation,
    getDeviceDisplayName,
    t,
  );

  return (
    <View {...(qaId ? testProps(`view_${qaId}_when_set_summary`) : {})}>
      <View style={styles.eventRow}>
        {eventSummary ? (
          <>
            <Text style={styles.descriptionText}>
              {eventSummary.whenLabel}: {eventSummary.displayName}:{" "}
              {eventSummary.paramName}{" "}
            </Text>
            <View style={styles.conditionTag}>
              <Text
                {...testProps("text_automation_condition")}
                style={styles.conditionTagText}
              >
                {eventSummary.conditionLabel}
              </Text>
            </View>
            <Text style={styles.descriptionText}>
              {" "}
              {eventSummary.valueDisplay}
            </Text>
          </>
        ) : (
          <Text style={styles.descriptionText}>
            {t("automation.card.noEvents")}
          </Text>
        )}
      </View>

      <View style={styles.separator} />

      <Text style={styles.descriptionText}>
        {t("automation.card.set")}:{"\n"}
        {actionDescription}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  eventRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  descriptionText: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
    lineHeight: 18,
  },
  conditionTag: {
    backgroundColor: `${tokens.colors.primary}20`,
    borderRadius: tokens.spacing._5,
    paddingHorizontal: tokens.spacing._5,
    paddingVertical: 2,
  },
  conditionTagText: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.primary,
  },
  separator: {
    height: 0.5,
    marginVertical: tokens.spacing._5,
    backgroundColor: tokens.colors.borderColor,
  },
});

export default observer(AutomationWhenSetSummary);
