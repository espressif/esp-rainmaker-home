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

// Types
import { ParamControlChildProps } from "./lib/types";
import { paramControlStyles as styles } from "./lib/styles";

/**
 * ColorTemperatureSlider
 *
 * A slider component for controlling color temperature of a light.
 * Features a gradient background representing warm to cool temperatures
 * and displays the current value in Kelvin.
 *
 * @param param - The device parameter to control
 * @param disabled - Whether the control is disabled
 * @returns JSX component for color temperature control
 */
const ColorTemperatureSlider = observer(
  ({
    label,
    value,
    onValueChange = () => {},
    disabled,
    meta = { min: 2700, max: 6500, step: 100 },
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
      onValueChange(event, roundedValue);
    };

    // 3. Render
    return (
      <View style={[styles.container, disabled && styles.disabled]}>
        <View style={[styles.header, disabled && styles.disabledText]}>
          <Text style={styles.title}>{label}</Text>
          <Text style={styles.value}>{value}K</Text>
        </View>

        <View style={styles.sliderContainer}>
          <Slider
            value={[value]}
            min={min}
            max={max}
            step={step}
            onSlideMove={handleValueChange}
            disabled={disabled}
            style={[styles.slider, { zIndex: 10 }]}
          >
            <Slider.Track
              style={[styles.track, { backgroundColor: "transparent" }]}
            >
              <Slider.TrackActive
                style={[styles.trackActive, { backgroundColor: "transparent" }]}
              />
            </Slider.Track>
            <Slider.Thumb
              index={0}
              style={[
                styles.thumb,
                { zIndex: 10 },
                disabled && styles.disabled,
              ]}
              size="$1.5"
              borderWidth={1}
            />
          </Slider>

          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 8,
              zIndex: 1,
            }}
          >
            <Svg width="100%" height="4" style={styles.gradientSvg}>
              <Defs>
                <LinearGradient
                  id="colorTempSliderGradient"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <Stop offset="0%" stopColor="#f8cf6d" />
                  <Stop offset="50%" stopColor="#ffffff" />
                  <Stop offset="100%" stopColor="#a4d5ff" />
                </LinearGradient>
              </Defs>
              <Rect
                width="100%"
                height="4"
                fill="url(#colorTempSliderGradient)"
                stroke={tokens.colors.bg2}
                strokeWidth="1"
                rx="2"
              />
            </Svg>
          </View>
        </View>
      </View>
    );
  }
);

export default ColorTemperatureSlider;
