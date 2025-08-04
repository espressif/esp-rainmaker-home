/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, GestureResponderEvent } from "react-native";

// Components
import { Slider } from "tamagui";
import { observer } from "mobx-react-lite";

// Types & Styles
import { ParamControlChildProps } from "./lib/types";
import { paramControlStyles as styles } from "./lib/styles";
import { tokens } from "@/theme/tokens";

/**
 * SliderControl
 *
 * A basic slider component for controlling numeric parameters.
 * Provides a simple slider interface with current value display.
 *
 * @param param - The device parameter to control
 * @param disabled - Whether the control is disabled
 * @returns JSX component for basic slider control
 */
const SliderControl = observer(
  ({
    label,
    value,
    onValueChange = () => {},
    disabled,
    meta = { min: 0, max: 100, step: 1 },
  }: ParamControlChildProps) => {
    // 1. Computed Values
    const { min, max, step } = meta;

    // 2. Handlers
    const handleValueChange = async (
      event: GestureResponderEvent,
      newValue: number
    ) => {
      if (disabled) return;
      const roundedValue = Math.round(newValue);
      if (roundedValue === value) return;
      if (roundedValue < min) return;
      if (roundedValue > max) return;
      onValueChange(event, newValue);
    };

    // 3. Render
    return (
      <View style={[styles.container, disabled && styles.disabled]}>
        <View style={[styles.header, disabled && styles.disabledText]}>
          <Text style={styles.title}>{label}</Text>
          <Text style={styles.value}>{value}</Text>
        </View>

        <View style={styles.sliderContainer}>
          <Slider
            value={[value]}
            min={min}
            max={max}
            step={step}
            onSlideMove={handleValueChange}
            disabled={disabled}
            style={[styles.slider]}
          >
            <Slider.Track
              style={{ ...styles.track, backgroundColor: tokens.colors.bg2 }}
            >
              <Slider.TrackActive
                style={{
                  ...styles.trackActive,
                  backgroundColor: tokens.colors.blue,
                }}
              />
            </Slider.Track>
            <Slider.Thumb
              index={0}
              style={[styles.thumb, disabled && styles.disabled]}
              size="$1.5"
              borderWidth={1}
            />
          </Slider>
        </View>
      </View>
    );
  }
);

export default SliderControl;
