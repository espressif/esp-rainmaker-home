/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Switch } from "tamagui";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { switchFrameProps } from "@shared/theme/switchFrameProps";
import { testProps } from "@shared/utils/testProps";
import { createAutomationStyles as styles } from "../../theme/createAutomationStyles";

export interface CreateAutomationRetriggerSectionProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (value: boolean) => void;
}

/**
 * Renders the create automation retrigger section UI section.
 */
export const CreateAutomationRetriggerSection: React.FC<
  CreateAutomationRetriggerSectionProps
> = ({ label, description, checked, disabled = false, onCheckedChange }) => {
  return (
    <View style={styles.section}>
      <View style={styles.toggleContainer}>
        <View style={styles.toggleInfo}>
          <Text {...testProps("text_retrigger")} style={styles.toggleLabel}>
            {label}
          </Text>
          <Text
            {...testProps("text_retrigger_description")}
            style={styles.toggleDescription}
          >
            {description}
          </Text>
        </View>
        <Switch
          {...testProps("switch_retrigger")}
          {...switchFrameProps}
          size="$2.5"
          checked={checked}
          disabled={disabled}
          style={StyleSheet.flatten([
            globalStyles.switch,
            disabled && styles.disabledButton,
          ])}
          onCheckedChange={onCheckedChange}
        >
          <Switch.Thumb
            animation="quicker"
            style={
              checked
                ? globalStyles.switchThumbActive
                : globalStyles.switchThumb
            }
          />
        </Switch>
      </View>
    </View>
  );
};
