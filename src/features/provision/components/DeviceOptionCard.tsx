/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { Typo } from "@shared/components";
import { testProps } from "@shared/utils/testProps";

interface DeviceOptionCardProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  onPress: () => void;
}

/**
 * DeviceOptionCard Component
 *
 * Displays a card for a device provisioning option
 */
export const DeviceOptionCard: React.FC<DeviceOptionCardProps> = ({
  icon,
  label,
  description,
  onPress,
}) => (
  <TouchableOpacity
    style={styles.optionCard}
    {...testProps("button_add_device_selection")}
    onPress={onPress}
  >
    <View {...testProps("view_icon")} style={styles.iconContainer}>
      {icon}
    </View>
    <View {...testProps("view_text")} style={styles.textContainer}>
      <Typo
        variant="h3"
        style={styles.title}
        qaId={`text_add_device_selection_${label.toLowerCase().replace(/\s+/g, "_")}`}
      >
        {label}
      </Typo>
      <Typo
        variant="body"
        style={styles.description}
        qaId={`text_add_device_selection_description_${label.toLowerCase().replace(/\s+/g, "_")}`}
      >
        {description}
      </Typo>
    </View>
    <ChevronRight size={20} color={tokens.colors.gray} />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing._15,
    marginBottom: tokens.spacing._10,
    ...globalStyles.shadowElevationForLightTheme,
  },
  iconContainer: {
    width: 40,
    height: 40,
    backgroundColor: tokens.colors.bg1,
    borderRadius: tokens.radius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  textContainer: {
    flex: 1,
    marginLeft: tokens.spacing._15,
  },
  title: {
    color: tokens.colors.text_primary,
    fontSize: tokens.fontSize.md,
    marginBottom: 2,
  },
  description: {
    color: tokens.colors.text_secondary,
    fontSize: tokens.fontSize.sm,
  },
});
