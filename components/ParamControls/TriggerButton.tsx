/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";

// Styles
import { paramControlStyles as styles } from "./lib/styles";

// Types
import { ParamControlChildProps } from "./lib/types";
import { observer } from "mobx-react-lite";

/**
 * TriggerButton
 *
 * A button component that activates while pressed and deactivates when released.
 * Displays current state and provides press-and-hold functionality.
 *
 * @param param - The parameter object containing value and setValue function
 * @param disabled - Optional flag to disable the control
 * @returns JSX component
 */
const TriggerButton = observer(
  ({ label, value, onValueChange, disabled, meta }: ParamControlChildProps) => {
    // State
    const [isActive, setIsActive] = useState(Boolean(value));

    // Effects
    useEffect(() => {
      setIsActive(Boolean(value));
    }, [value]);

    const updateValue = async (value: boolean) => {
      onValueChange?.(null, value);
    };

    // Handlers
    const handlePressIn = async () => {
      if (disabled) return;
      await updateValue(true);
      setIsActive(true);
    };

    const handlePressOut = async () => {
      if (disabled) return;
      await updateValue(false);
      setIsActive(false);
    };

    // Render
    return (
      <View style={[styles.container, disabled && styles.disabled]}>
        <View style={styles.header}>
          <Text style={styles.title}>{label}</Text>
          <Text style={styles.value}>{isActive ? "Active" : "Inactive"}</Text>
        </View>

        <TouchableOpacity
          style={[styles.triggerButton, isActive && styles.triggerButtonActive]}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled}
        >
          <Text
            style={[
              styles.triggerButtonText,
              isActive && styles.triggerButtonTextActive,
            ]}
          >
            Press and Hold
          </Text>
        </TouchableOpacity>
      </View>
    );
  }
);

export default TriggerButton;
