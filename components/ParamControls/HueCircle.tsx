/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";

// Components
import { ColorPicker } from "react-native-color-picker";

// Types & Styles
import { ParamControlChildProps, getParamBounds } from "./lib/types";
import { paramControlStyles as styles } from "./lib/styles";
import { tokens } from "@/theme/tokens";

interface HSVColor {
  h: number;
  s: number;
  v: number;
}

/**
 * HueCircle
 *
 * A circular color picker component for selecting hue values.
 * Provides an intuitive color wheel interface for hue selection
 * and displays the current value in degrees.
 *
 * @param param - The device parameter to control
 * @param disabled - Whether the control is disabled
 * @returns JSX component for circular hue control
 */
const HueCircle: React.FC<ParamControlChildProps> = ({
  label,
  value,
  onValueChange = () => {},
  disabled,
}) => {
  const currentHue = typeof value === "number" ? value : 0;

  // 2. Convert hue to HSV color
  const getInitialColor = useCallback((hue: number): HSVColor => {
    return {
      h: hue,
      s: 1,
      v: 1,
    };
  }, []);

  // 3. Handle color changes
  const handleColorChange = useCallback(
    (color: HSVColor) => {
      if (disabled) return;

      // Normalize hue to 0-360 range
      let newHue = ((color.h % 360) + 360) % 360;

      // Only update if the value has actually changed
      if (Math.abs(newHue - currentHue) > 0.1) {
        onValueChange(null, newHue, false);
      }
    },
    [disabled, currentHue, onValueChange]
  );

  // 4. Render
  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      <View style={styles.header}>
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.value}>{Math.round(currentHue)}°</Text>
      </View>

      <View style={localStyles.colorPickerContainer}>
        <ColorPicker
          onColorChange={handleColorChange}
          style={localStyles.colorPicker}
          hideSliders
          color={getInitialColor(currentHue)}
        />
      </View>
    </View>
  );
};

const localStyles = StyleSheet.create({
  colorPickerContainer: {
    height: 200,
    aspectRatio: 1,
    alignSelf: "center",
    marginVertical: tokens.spacing._15,
  },
  colorPicker: {
    flex: 1,
    padding: 0,
  },
});

export default HueCircle;
