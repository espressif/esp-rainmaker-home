/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Switch } from "tamagui";

// Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Hooks
import { useTranslation } from "react-i18next";
import { useCDF } from "@/hooks/useCDF";
import { ESPAutomationEvent } from "@espressif/rainmaker-base-cdf";
import { AutomationCardProps } from "@/types/global";

// Mobx observer
import { observer } from "mobx-react-lite";

/**
 * AutomationCard
 *
 * A card component for displaying automation information.
 * Features:
 * - Automation name with enable/disable toggle
 * - Event description (trigger conditions)
 * - Smart action display:
 *   - Shows detailed info for 1-2 actions
 *   - Shows summary for 3+ actions (device count and action count)
 * - Touch interaction for editing
 */
const AutomationCard: React.FC<AutomationCardProps> = ({
  automation,
  onPress,
  onToggle,
  toggleLoading = false,
}) => {
  const { t } = useTranslation();
  const { store } = useCDF();

  // Extract automation properties with fallbacks
  const automationName = automation.automationName || "Unnamed Automation";
  const isEnabled = automation.enabled || false;

  /**
   * Gets device display name from store using nodeId and device name
   * @param nodeId - Node ID from automation
   * @param deviceName - Device name from automation event
   * @returns Device display name or fallback to device name
   */
  const getDeviceDisplayName = useCallback(
    (nodeId: string, deviceName: string) => {
      try {
        const node = store?.nodeStore?.nodesByID?.[nodeId];
        if (!node?.nodeConfig?.devices) {
          return deviceName; // Fallback to device name
        }

        const device = node.nodeConfig.devices.find(
          (device) => device.name === deviceName
        );

        return device?.displayName || deviceName; // Return display name or fallback
      } catch (error) {
        console.warn("Error getting device display name:", error);
        return deviceName; // Fallback to device name
      }
    },
    [store]
  );

  /**
   * Formats event description from automation events
   */
  const getEventDescription = useCallback(() => {
    // Get first event for display (automations can have multiple events)
    const event = automation.events[0] as ESPAutomationEvent;

    if (event) {
      // Node-based event (device parameter condition)
      const deviceName = event.deviceName || "Device";
      // Get device display name using nodeId and device name
      const displayName = automation.nodeId
        ? getDeviceDisplayName(automation.nodeId, deviceName)
        : deviceName;
      const paramName = event.param || "Parameter";
      const condition = event.check || ">";
      const value = event.value !== undefined ? event.value : "?";

      return `${t(
        "automation.card.if"
      )}: ${displayName}: ${paramName} ${condition} ${value}`;
    }
  }, [automation, t, getDeviceDisplayName]);

  /**
   * Formats action description from automation actions
   */
  const getActionDescription = useCallback(() => {
    if (!automation.actions || automation.actions.length === 0) {
      return t("automation.card.noActions");
    }

    // If there's only one action, show it in detail
    if (automation.actions.length === 1) {
      const action = automation.actions[0];
      const deviceName = action.deviceName || "Device";
      // Get device display name using nodeId and device name
      const displayName = action.nodeId
        ? getDeviceDisplayName(action.nodeId, deviceName)
        : deviceName;
      const paramName = action.param || "Parameter";
      const value = action.value !== undefined ? action.value : "?";

      // Format boolean values
      const displayValue =
        typeof value === "boolean"
          ? value
            ? t("automation.card.on")
            : t("automation.card.off")
          : value;

      return `${displayName}: ${paramName}: ${displayValue}`;
    }

    // Group actions by nodeId + deviceName for proper uniqueness
    const deviceGroups = new Map<string, typeof automation.actions>();

    automation.actions.forEach((action) => {
      const deviceKey = `${action.nodeId}-${action.deviceName}`;
      if (!deviceGroups.has(deviceKey)) {
        deviceGroups.set(deviceKey, []);
      }
      deviceGroups.get(deviceKey)!.push(action);
    });

    const uniqueDeviceCount = deviceGroups.size;
    const totalActions = automation.actions.length;

    if (uniqueDeviceCount === 1) {
      // Multiple actions on the same device (same nodeId + deviceName) - show comma-separated parameters
      const deviceActions = Array.from(deviceGroups.values())[0];
      const deviceName = deviceActions[0].deviceName || "Device";
      // Get device display name using nodeId and device name
      const displayName = deviceActions[0].nodeId
        ? getDeviceDisplayName(deviceActions[0].nodeId, deviceName)
        : deviceName;

      const parameters = deviceActions
        .map((action) => {
          const paramName = action.param || "Parameter";
          const value = action.value !== undefined ? action.value : "?";

          // Format boolean values
          const displayValue =
            typeof value === "boolean"
              ? value
                ? t("automation.card.on")
                : t("automation.card.off")
              : value;

          return `${paramName}: ${displayValue}`;
        })
        .join(", ");

      return `${displayName}: ${parameters}`;
    } else {
      // Multiple actions on different devices
      return `${uniqueDeviceCount} ${t(
        "automation.card.devices"
      )} (${totalActions} ${t("automation.card.actions")})`;
    }
  }, [automation, t, getDeviceDisplayName]);

  const handleToggle = (value: boolean) => {
    if (onToggle && !toggleLoading) {
      onToggle(value);
    }
  };

  return (
    <Pressable
      style={[styles.card, toggleLoading && styles.cardLoading]}
      onPress={onPress}
      disabled={toggleLoading}
    >
      {/* Header with name and toggle */}
      <View style={styles.header}>
        <Text style={styles.automationName} numberOfLines={1}>
          {automationName}
        </Text>
        <Switch
          size="$2.5"
          borderColor={tokens.colors.bg1}
          borderWidth={0}
          checked={isEnabled}
          disabled={toggleLoading}
          style={globalStyles.switch}
          onCheckedChange={(value) => handleToggle(value)}
        >
          <Switch.Thumb
            animation="quicker"
            style={
              isEnabled
                ? globalStyles.switchThumbActive
                : globalStyles.switchThumb
            }
          />
        </Switch>
      </View>

      {/* Event Description */}
      <View>
        <Text style={styles.descriptionText} numberOfLines={2}>
          {getEventDescription()}
        </Text>
      </View>

      <View style={styles.separator}></View>

      {/* Action Description */}
      <View>
        <Text style={styles.descriptionText} numberOfLines={2}>
          {t("automation.card.set")}:{"\n"}
          {getActionDescription()}
        </Text>
      </View>
    </Pressable>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing._15,
    marginBottom: tokens.spacing._10,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.borderColor,
    shadowColor: tokens.colors.text_secondary,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardLoading: {
    opacity: 0.6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: tokens.spacing._10,
  },
  automationName: {
    flex: 1,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    marginRight: tokens.spacing._10,
  },
  descriptionText: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
    lineHeight: 18,
  },
  separator: {
    height: 0.5,
    marginVertical: tokens.spacing._5,
    backgroundColor: tokens.colors.borderColor,
  },
});

export default observer(AutomationCard);
