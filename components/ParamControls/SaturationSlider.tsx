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
 * SaturationSlider
 *
 * A slider component for controlling color saturation.
 * Features a gradient background representing saturation levels
 * and displays the current value as a percentage.
 *
 * @param param - The device parameter to control
 * @param disabled - Whether the control is disabled
 * @returns JSX component for saturation control
 */
const SaturationSlider = observer(
  ({
    label,
    value,
    onValueChange = () => {},
    disabled,
    meta = { min: 0, max: 100, step: 1 },
  }: ParamControlChildProps) => {
    // 1. Computed Values
    const { min, max, step = 1, hue = 0, brightness = 50 } = meta;

    /**
     * Utility function to get HSL color string
     * @param h - hue value
     * @param s - saturation value
     * @returns HSL color string
     */
    const getHSLColor = (h: number, s: number) => {
      return `hsl(${h}, ${s}%, ${brightness}%)`;
    };

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
          <Text style={styles.value}>{value}%</Text>
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
                  id="saturationSliderGradient"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <Stop offset="0%" stopColor="#808080" />
                  <Stop offset="100%" stopColor={getHSLColor(hue, 100)} />
                </LinearGradient>
              </Defs>
              <Rect
                width="100%"
                height="4"
                fill="url(#saturationSliderGradient)"
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

export default SaturationSlider;
