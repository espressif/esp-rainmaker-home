/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";

// Styles
import { tokens } from "@/theme/tokens";
import { paramControlStyles as styles } from "./lib/styles";

// Icons
import { Lightbulb, LightbulbOff } from "lucide-react-native";

// Types
import { ParamControlChildProps } from "./lib/types";
import { observer } from "mobx-react-lite";

/**
 * DeviceLightBulb
 *
 * A component that renders a light bulb control with on/off functionality.
 * Displays the current state and allows toggling through touch interaction.
 *
 * @param param - The parameter object containing value and setValue function
 * @param disabled - Optional flag to disable the control
 * @returns JSX component
 */
const DeviceLightBulb = observer(
  ({ label, value, onValueChange, disabled }: ParamControlChildProps) => {
    // State
    const [isOn, _] = useState(Boolean(value));
    const size = 60; // Default size for light bulb

    // Handlers
    const handleValueChange = async (value: boolean) => {
      if (disabled) return;
      onValueChange?.(null, value);
    };

    // Render
    return (
      <View style={[styles.container, disabled && styles.disabled]}>
        <View style={styles.header}>
          <Text style={styles.title}>{label}</Text>
          <Text style={styles.value}>{isOn ? "ON" : "OFF"}</Text>
        </View>

        <View style={styles.sliderContainer}>
          <TouchableOpacity
            style={[
              styles.lightBulb,
              { width: size, height: size },
              isOn && styles.lightBulbActive,
              disabled && styles.disabled,
            ]}
            onPress={() => handleValueChange(!isOn)}
            activeOpacity={0.7}
            disabled={disabled}
          >
            {isOn ? (
              <Lightbulb
                size={size * 0.6}
                color={isOn ? tokens.colors.white : tokens.colors.gray}
              />
            ) : (
              <LightbulbOff size={size * 0.6} color={tokens.colors.gray} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }
);

export default DeviceLightBulb;
