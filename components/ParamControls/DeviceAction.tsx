/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, StyleSheet, Image, Pressable } from "react-native";

// Utils
import { getDeviceImage } from "@/utils/device";

// Hooks
import { useTranslation } from "react-i18next";

// Styles
import { tokens } from "@/theme/tokens";

import { testProps } from "../../utils/testProps";
interface DeviceActionProps {
  device: string;
  displayDeviceName: string;
  /** Action payload for the device */
  actions: Record<string, any>;
  onPress: () => void;
  /** Callback for remove action */
  onRemove?: () => void;
  rightSlot?: React.ReactNode;
  badgeLable?: React.ReactNode;
  /** Event conditions for automation events (param -> {condition, value}) */
  eventConditions?: Record<string, { condition: string; value: any }>;
  /** Whether this is displaying event conditions instead of actions */
  isEventMode?: boolean;
  isOutOfSync?: boolean;
  /** QA automation identifier */
  qaId?: string;
}

/**
 * DeviceAction
 *
 * A component for displaying device actions in scenes.
 * Features:
 * - Device icon and name display
 * - Action parameter display
 * - Consistent styling with app
 */
const DeviceAction: React.FC<DeviceActionProps> = ({
  device,
  displayDeviceName,
  actions,
  onPress,
  rightSlot,
  badgeLable,
  eventConditions,
  isEventMode = false,
  isOutOfSync = false,
  qaId,
}) => {
  const { t } = useTranslation();

  // Helper function to format condition labels
  const getConditionLabel = (condition: string) => {
    switch (condition) {
      case "==":
        return t("automation.conditions.equals");
      case "!=":
        return t("automation.conditions.notEquals");
      case ">":
        return t("automation.conditions.greaterThan");
      case "<":
        return t("automation.conditions.lessThan");
      case ">=":
        return t("automation.conditions.greaterThanOrEqual");
      case "<=":
        return t("automation.conditions.lessThanOrEqual");
      default:
        return condition;
    }
  };

  // Helper function to format value display
  const getValueDisplay = (value: any) => {
    if (typeof value === "boolean") {
      return value
        ? t("automation.conditions.on")
        : t("automation.conditions.off");
    }
    return value?.toString() || "N/A";
  };

  return (
    <View {...(qaId ? testProps(`view_${qaId}`) : {})}  style={styles.containerWrapper}>
      <Pressable {...(qaId ? testProps(`button_${qaId}`) : {})} style={[styles.container]} onPress={onPress}>
        <View style={styles.deviceInfo}>
          <Image
            {...(qaId ? testProps(`image_${displayDeviceName}`) : {})}
            source={getDeviceImage(device, true)}
            style={styles.deviceIcon}
          />
          <View style={styles.textContainer}>
            <Text {...(qaId ? testProps(`text_${displayDeviceName}_device_name`) : {})} style={[styles.deviceName]} numberOfLines={1}>
              {displayDeviceName}
            </Text>
            <View style={styles.actionContainer}>
              {isOutOfSync ? (
                <Text style={[styles.actionText, styles.outOfSyncText]}>
                  {t("device.status.outOfSync")}
                </Text>
              ) : badgeLable ? (
                <View style={styles.badgeContainer}>{badgeLable}</View>
              ) : isEventMode && eventConditions ? (
                // Render event conditions
                Object.entries(eventConditions).map(
                  ([param, conditionData], index) => (
                    <Text
                      style={[styles.actionText]}
                      numberOfLines={1}
                      key={`${param}-${index}-event`}
                    >
                      {`${param} ${getConditionLabel(
                        conditionData.condition
                      )} ${getValueDisplay(conditionData.value)}`}
                    </Text>
                  )
                )
              ) : (
                // Render actions (original logic)
                Object.entries(actions).map(([key, value], index) => (
                  <Text
                    style={[styles.actionText]}
                    numberOfLines={1}
                    key={`${key}-${index}-action`}
                  >
                    {`${key} ${t("scene.deviceParamsSelection.setTo")} ${
                      typeof value === "boolean"
                        ? value
                          ? t("scene.deviceParamsSelection.parameterOn")
                          : t("scene.deviceParamsSelection.parameterOff")
                        : value
                    }`}
                  </Text>
                ))
              )}
            </View>
          </View>
        </View>
        {rightSlot}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  badgeContainer: {
    backgroundColor: tokens.colors.white,
  },
  containerWrapper: {
    position: "relative",
    borderRadius: tokens.radius.sm,
    overflow: "hidden",
    borderWidth: tokens.border.defaultWidth,
    borderColor: tokens.colors.borderColor,
  },
  container: {
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: tokens.spacing._10,
  },
  deviceInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  deviceIcon: {
    width: 40,
    height: 40,
    marginRight: tokens.spacing._10,
  },
  textContainer: {
    flex: 1,
  },
  actionContainer: {
    marginTop: tokens.spacing._5,
  },
  deviceName: {
    fontWeight: 500,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    padding: 0,
    marginBottom: 0,
  },
  actionText: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
  },
  outOfSyncText: {
    color: tokens.colors.red,
    fontFamily: tokens.fonts.medium,
  },
  statusIndicator: {
    marginLeft: tokens.spacing._10,
  },
  statusText: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.medium,
  },
  onlineText: {
    color: tokens.colors.green,
  },
  offlineText: {
    color: tokens.colors.red,
  },
  deviceType: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
    marginBottom: tokens.spacing._5,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._5,
    marginLeft: tokens.spacing._10,
  },
  statusIcon: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.medium,
  },
  removeButton: {
    backgroundColor: tokens.colors.red,
    padding: tokens.spacing._5,
    borderRadius: tokens.radius.sm,
    marginLeft: tokens.spacing._10,
  },
  removeButtonText: {
    color: tokens.colors.white,
  },
});

export default DeviceAction;
