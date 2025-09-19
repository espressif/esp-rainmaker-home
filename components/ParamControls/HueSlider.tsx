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
 * HueSlider
 *
 * A slider component for controlling color hue.
 * Features a rainbow gradient background representing the full color spectrum
 * and displays the current value in degrees.
 *
 * @param param - The device parameter to control
 * @param disabled - Whether the control is disabled
 * @returns JSX component for hue control
 */
const HueSlider = observer(
  ({
    label,
    value,
    onValueChange = () => {},
    disabled,
    meta = { min: 0, max: 360, step: 1 },
  }: ParamControlChildProps) => {
    // 1. Computed Values
    const { min = 0, max = 360, step = 1 } = meta;

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
          <Text style={styles.value}>{value}°</Text>
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
                  id="hueSliderGradient"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <Stop offset="0%" stopColor="hsl(0, 100%, 50%)" />
                  <Stop offset="16.66%" stopColor="hsl(60, 100%, 50%)" />
                  <Stop offset="33.33%" stopColor="hsl(120, 100%, 50%)" />
                  <Stop offset="50%" stopColor="hsl(180, 100%, 50%)" />
                  <Stop offset="66.66%" stopColor="hsl(240, 100%, 50%)" />
                  <Stop offset="83.33%" stopColor="hsl(300, 100%, 50%)" />
                  <Stop offset="100%" stopColor="hsl(360, 100%, 50%)" />
                </LinearGradient>
              </Defs>
              <Rect
                width="100%"
                height="4"
                fill="url(#hueSliderGradient)"
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

export default HueSlider;
