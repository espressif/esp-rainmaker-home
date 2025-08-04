/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { TouchableOpacity, Text, View } from "react-native";

// Styles
import { paramControlStyles as styles } from "./lib/styles";

// Types
import { ParamControlChildProps } from "./lib/types";

/**
 * PushButton
 *
 * A button component that toggles between ON/OFF states.
 * Displays current state and provides visual feedback on interaction.
 *
 * @param param - The parameter object containing value and setValue function
 * @param disabled - Optional flag to disable the control
 * @returns JSX component
 */
const PushButton: React.FC<ParamControlChildProps> = ({
  label,
  value,
  onValueChange,
  disabled,
}) => {
  const [isOn, setIsOn] = useState(Boolean(value));

  useEffect(() => {
    setIsOn(Boolean(value));
  }, [value]);

  // Handlers
  const handlePress = () => {
    if (disabled) return;
    onValueChange?.(null, !isOn);
  };

  // Render
  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      <View style={styles.header}>
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.value}>{isOn ? "ON" : "OFF"}</Text>
      </View>

      <TouchableOpacity
        style={[
          styles.pushButton,
          isOn && styles.pushButtonActive,
          disabled && styles.disabled,
        ]}
        onPress={handlePress}
        activeOpacity={0.8}
        disabled={disabled}
      >
        <Text
          style={[styles.pushButtonText, isOn && styles.pushButtonTextActive]}
        >
          {isOn ? "ON" : "OFF"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default PushButton;
