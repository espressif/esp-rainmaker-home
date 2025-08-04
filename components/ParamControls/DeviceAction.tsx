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
}) => {
  const { t } = useTranslation();
  return (
    <View style={styles.containerWrapper}>
      <Pressable style={[styles.container]} onPress={onPress}>
        <View style={styles.deviceInfo}>
          <Image
            source={getDeviceImage(device, true)}
            style={styles.deviceIcon}
          />
          <View style={styles.textContainer}>
            <Text style={[styles.deviceName]} numberOfLines={1}>
              {displayDeviceName}
            </Text>
            <View style={styles.actionContainer}>
              {badgeLable ? (
                <View style={styles.badgeContainer}>{badgeLable}</View>
              ) : (
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
