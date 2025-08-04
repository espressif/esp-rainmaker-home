/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { View, Text } from "react-native";

// UI Components
import { Switch } from "tamagui";

// Styles
import { paramControlStyles as styles } from "./lib/styles";

// Types
import { ParamControlChildProps } from "./lib/types";
import { observer } from "mobx-react-lite";

/**
 * ToggleSwitch
 *
 * A switch component that toggles between ON/OFF states.
 * Displays a title and a toggle switch control.
 *
 * @param param - The parameter object containing value, properties, and setValue function
 * @param disabled - Optional flag to disable the control
 * @returns JSX component
 */
const ToggleSwitch = observer(
  ({ label, value, onValueChange, disabled, meta }: ParamControlChildProps) => {
    // State
    const [isChecked, setIsChecked] = useState(Boolean(value));

    // Effects
    useEffect(() => {
      setIsChecked(Boolean(value));
    }, [value]);

    // Handlers
    const handleValueChange = async (checked: boolean) => {
      if (disabled) return;
      onValueChange?.(null, checked);
      setIsChecked(checked);
    };

    // Render
    return (
      <View style={[styles.container, disabled && styles.disabled]}>
        <View style={styles.content}>
          <View style={styles.textContainer}>
            <Text style={styles.title}>{label}</Text>
          </View>

          <Switch
            checked={isChecked}
            onCheckedChange={handleValueChange}
            disabled={disabled}
            style={styles.toggleSwitch}
            size="$2.5"
          >
            <Switch.Thumb
              style={isChecked ? styles.toggleThumbActive : styles.toggleThumb}
            />
          </Switch>
        </View>
      </View>
    );
  }
);

export default ToggleSwitch;
