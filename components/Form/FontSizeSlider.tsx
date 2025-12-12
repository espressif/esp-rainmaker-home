/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Slider from "@react-native-community/slider";
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

interface FontSizeSliderProps {
  /** Current font size value (1-4) */
  value: number;
  /** Callback when font size changes */
  onValueChange: (value: number) => void;
  /** Minimum value (default: 1) */
  minimumValue?: number;
  /** Maximum value (default: 4) */
  maximumValue?: number;
  /** Step value (default: 1) */
  step?: number;
}

/**
 * FontSizeSlider Component
 *
 * A compact, reusable font size slider component.
 * Displays a slider with numeric labels (1-4) below it.
 */
const FontSizeSlider: React.FC<FontSizeSliderProps> = ({
  value,
  onValueChange,
  minimumValue = 1,
  maximumValue = 4,
  step = 1,
}) => {
  return (
    <View style={styles.container}>
      <Slider
        style={styles.slider}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        step={step}
        value={value}
        onValueChange={onValueChange}
        minimumTrackTintColor={tokens.colors.primary}
        maximumTrackTintColor={tokens.colors.bg3}
        thumbTintColor={tokens.colors.primary}
      />
      <View style={styles.labelsContainer}>
        {Array.from({ length: maximumValue - minimumValue + 1 }, (_, i) => {
          const labelValue = minimumValue + i;
          return (
            <Text
              key={i}
              style={[globalStyles.fontSm, globalStyles.textSecondary]}
            >
              {labelValue}
            </Text>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  slider: {
    width: "100%",
    height: 30,
  },
  labelsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: tokens.spacing._5,
    paddingHorizontal: 0,
  },
});

export default FontSizeSlider;

