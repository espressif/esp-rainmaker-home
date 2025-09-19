/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, GestureResponderEvent } from "react-native";

// Components
import { Slider } from "tamagui";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { observer } from "mobx-react-lite";

// Styles
import { tokens } from "@/theme/tokens";

// Types & Styles
import { ParamControlChildProps } from "./lib/types";
import { paramControlStyles as styles } from "./lib/styles";

/**
 * TemperatureSlider
 *
 * A slider component for controlling temperature settings.
 * Features a gradient background representing temperature levels from cold to hot
 * and displays the current value in Celsius.
 *
 * @param param - The device parameter to control
 * @param disabled - Whether the control is disabled
 * @returns JSX component for temperature control
 */
const TemperatureSlider = observer(
  ({
    label,
    value,
    onValueChange = () => {},
    disabled,
    meta = { min: 10, max: 35, step: 0.5 },
  }: ParamControlChildProps) => {
    // 1. Computed Values
    const { min = 10, max = 35, step = 0.5 } = meta;

    /**
     * This function is used to handle the value change
     *
     * @param event - The event object
     * @param newValue - The new value
     * @returns void
     */
    const handleValueChange = async (
      event: GestureResponderEvent,
      newValue: number
    ) => {
      if (disabled) return;
      if (newValue === value) return;
      if (newValue < min) return;
      if (newValue > max) return;
      onValueChange(event, newValue);
    };

    // 3. Render
    return (
      <View style={[styles.container, disabled && styles.disabled]}>
        <View style={styles.header}>
          <Text style={styles.title}>{label}</Text>
          <Text style={styles.value}>{value}°C</Text>
        </View>

        <View style={styles.sliderContainer}>
          <Svg width="100%" height="4" style={styles.gradientSvg}>
            <Defs>
              <LinearGradient
                id="tempSliderGradient"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                <Stop offset="0%" stopColor="#2196f3" />
                <Stop offset="25%" stopColor="#00bcd4" />
                <Stop offset="50%" stopColor="#4caf50" />
                <Stop offset="75%" stopColor="#ff9800" />
                <Stop offset="100%" stopColor="#f44336" />
              </LinearGradient>
            </Defs>
            <Rect
              width="100%"
              height="4"
              fill="url(#tempSliderGradient)"
              stroke={tokens.colors.bg2}
              strokeWidth="1"
              rx="2"
            />
          </Svg>
          <Slider
            value={[value]}
            min={min}
            max={max}
            step={step}
            onSlideMove={handleValueChange}
            disabled={disabled}
            style={styles.slider}
          >
            <Slider.Track style={styles.track}>
              <Slider.TrackActive style={styles.trackActive} />
            </Slider.Track>
            <Slider.Thumb
              index={0}
              style={styles.thumb}
              size="$1.5"
              borderWidth={1}
            />
          </Slider>
        </View>
      </View>
    );
  }
);

export default TemperatureSlider;
