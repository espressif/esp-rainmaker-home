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
 * VolumeSlider
 *
 * A slider component for controlling volume levels.
 * Features a gradient background representing volume intensity
 * and displays the current value as a percentage.
 *
 * @param param - The device parameter to control
 * @param disabled - Whether the control is disabled
 * @returns JSX component for volume control
 */
const VolumeSlider = observer(
  ({
    label,
    value,
    onValueChange,
    disabled,
    meta = { min: 1, max: 5, step: 1 },
  }: ParamControlChildProps) => {
    // 1. Computed Values
    const { min, max, step = 1 } = meta;

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
      const roundedValue = Math.round(newValue);
      if (roundedValue === value) return;
      if (roundedValue < min) return;
      if (roundedValue > max) return;
      onValueChange?.(event, roundedValue);
    };

    // 3. Render
    return (
      <View style={[styles.container, disabled && styles.disabled]}>
        <View style={styles.header}>
          <Text style={styles.title}>{label}</Text>
          <Text style={styles.value}>{value}%</Text>
        </View>

        <View style={styles.sliderContainer}>
          <Svg width="100%" height="4" style={styles.gradientSvg}>
            <Defs>
              <LinearGradient
                id="volumeSliderGradient"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                <Stop offset="0%" stopColor="#9e9e9e" />
                <Stop offset="33%" stopColor="#4caf50" />
                <Stop offset="66%" stopColor="#ff9800" />
                <Stop offset="100%" stopColor="#f44336" />
              </LinearGradient>
            </Defs>
            <Rect
              width="100%"
              height="4"
              fill="url(#volumeSliderGradient)"
              stroke={tokens.colors.bg2}
              strokeWidth="1"
              rx="2"
            />
            <Rect
              x={`${value}%`}
              y="0"
              width="2"
              height="4"
              fill="white"
              rx="1"
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
              style={styles.speedThumb}
              size="$1.5"
              borderWidth={1}
            />
          </Slider>
        </View>
      </View>
    );
  }
);

export default VolumeSlider;
