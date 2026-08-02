/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, GestureResponderEvent } from "react-native";

// Components
import { Slider } from "tamagui";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { observer } from "mobx-react-lite";

// Styles
import { tokens } from "@shared/theme/tokens";

// Types & Styles
import { ParamControlChildProps } from "./lib/types";
import { paramControlStyles as styles } from "./lib/styles";
import { useDragBubble } from "./lib/useDragBubble";

/**
 * TemperatureSlider
 *
 * A slider component for controlling temperature settings.
 * Features a gradient background representing temperature levels from cold to hot
 * and displays the current value in Celsius.
 * @param param - The device parameter to control
 * @param disabled - Whether the control is disabled
 * @returns Climate temperature slider respecting `meta` min/max/step
 */
const TemperatureSlider = observer(
  ({
    label,
    value,
    onValueChange = () => {},
    disabled,
    meta = { min: 10, max: 35, step: 0.5 },
    compact = false,
  }: ParamControlChildProps) => {
    // 1. Computed Values
    const { min = 10, max = 35, step = 0.5 } = meta;

    /**
     * This function is used to handle the value change
     * @param event - The event object
     * @param newValue - The new value
     */
    const { isDragging, onSlideStart, onSlideTick, onSlideEnd } =
      useDragBubble();

    const commitValue = (
      event: GestureResponderEvent | null,
      newValue: number,
    ) => {
      onSlideTick();
      if (disabled) return;
      if (newValue === value) return;
      if (newValue < min) return;
      if (newValue > max) return;
      onValueChange(event, newValue);
    };

    const thumbPercent = max > min ? ((value - min) / (max - min)) * 100 : 0;

    return (
      <View
        style={[
          styles.container,
          compact && styles.containerCompact,
          disabled && styles.disabled,
        ]}
      >
        {compact ? (
          <View style={styles.compactHeader}>
            <Text
              style={[styles.compactTitle, disabled && styles.disabledText]}
              numberOfLines={1}
            >
              {label}
            </Text>
            <Text style={styles.compactValue}>{value}°C</Text>
          </View>
        ) : (
          <>
            <Text
              style={[styles.sliderLabel, disabled && styles.disabledText]}
            >
              {label}
            </Text>

            <View style={styles.rangeRow}>
              <Text style={styles.value}>{min}°C</Text>
              <Text style={styles.value}>{max}°C</Text>
            </View>
          </>
        )}

        <View style={styles.sliderWrapper}>
          {isDragging && (
            <View
              style={[
                styles.bubbleContainer,
                {
                  left: `${thumbPercent}%`,
                  transform: [{ translateX: -24 }],
                },
              ]}
            >
              <View style={styles.bubble}>
                <Text style={styles.bubbleText}>{value}°C</Text>
              </View>
              <View style={styles.bubbleArrow} />
            </View>
          )}

          <View style={styles.sliderContainer}>
            <View style={[styles.gradientOverlay, { top: 10 }]}>
              <Svg width="100%" height="10" style={styles.gradientSvg}>
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
                  height="10"
                  fill="url(#tempSliderGradient)"
                  stroke={tokens.colors.bg2}
                  strokeWidth="1"
                  rx="5"
                />
              </Svg>
            </View>
            <Slider
              value={[value]}
              min={min}
              max={max}
              step={step}
              onSlideMove={commitValue}
              onSlideStart={onSlideStart}
              onSlideEnd={onSlideEnd}
              disabled={disabled}
              style={[styles.slider, { zIndex: 10 }]}
            >
              <Slider.Track
                style={[
                  styles.track,
                  styles.trackSmall,
                  { backgroundColor: "transparent" },
                ]}
              >
                <Slider.TrackActive
                  style={[
                    styles.trackActive,
                    styles.trackSmall,
                    { backgroundColor: "transparent" },
                  ]}
                />
              </Slider.Track>
              <Slider.Thumb
                index={0}
                style={[
                  styles.thumb,
                  styles.thumbSmall,
                  { zIndex: 10 },
                  disabled && styles.thumbDisabled,
                ]}
                size="$1.5"
                borderWidth={1}
              />
            </Slider>
          </View>
        </View>

        {!compact && (
          <View style={styles.thumbValueContainer}>
            <Text
              style={[
                styles.thumbValueText,
                {
                  left: `${thumbPercent}%`,
                  transform: [{ translateX: -(40 * thumbPercent) / 100 }],
                  opacity: isDragging ? 0 : 1,
                },
              ]}
            >
              {value}°C
            </Text>
          </View>
        )}
      </View>
    );
  }
);

export default TemperatureSlider;
