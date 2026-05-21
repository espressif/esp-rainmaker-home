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
import {
  ParamControlChildProps,
  comparableRoundedParamNumber,
} from "./lib/types";
import { paramControlStyles as styles } from "./lib/styles";
import { useDragBubble } from "./lib/useDragBubble";

/**
 * SpeedSlider
 *
 * A slider component for controlling device speed parameter.
 * Features a multi-color gradient background representing speed levels
 * and displays the current value as a percentage.
 * @param param - The device parameter to control
 * @param disabled - Whether the control is disabled
 * @returns Fan speed slider with optional numeric bounds from `meta`
 */
const SpeedSlider = observer(
  ({
    label,
    value,
    onValueChange,
    disabled,
    meta = { min: 0, max: 100, step: 1 },
    compact = false,
  }: ParamControlChildProps) => {
    // 1. Computed Values
    const { min, max, step = 1 } = meta;

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
      const roundedValue = Math.round(newValue);
      const cur = comparableRoundedParamNumber(value);
      if (cur !== null && roundedValue === cur) return;
      if (roundedValue < min) return;
      if (roundedValue > max) return;
      onValueChange?.(event, roundedValue);
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
            <Text style={styles.compactValue}>{value}%</Text>
          </View>
        ) : (
          <>
            <Text
              style={[styles.sliderLabel, disabled && styles.disabledText]}
            >
              {label}
            </Text>

            <View style={styles.rangeRow}>
              <Text style={styles.value}>{min}%</Text>
              <Text style={styles.value}>{max}%</Text>
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
                <Text style={styles.bubbleText}>{value}%</Text>
              </View>
              <View style={styles.bubbleArrow} />
            </View>
          )}

          <View style={styles.sliderContainer}>
            <Slider
              value={[value]}
              min={min}
              max={max}
              step={step}
              onSlideMove={commitValue}
              onSlideStart={onSlideStart}
              onSlideEnd={onSlideEnd}
              disabled={disabled}
              style={styles.slider}
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
                style={[styles.thumb, styles.thumbSmall, { zIndex: 10 }]}
                size="$1.5"
                borderWidth={1}
              />
            </Slider>

            <View style={[styles.gradientOverlay, { top: 10 }]}>
              <Svg width="100%" height="10" style={styles.gradientSvg}>
                <Defs>
                  <LinearGradient
                    id="speedSliderGradient"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    <Stop offset="0%" stopColor="#9e9e9e" />
                    <Stop offset="20%" stopColor="#2196f3" />
                    <Stop offset="50%" stopColor="#00bcd4" />
                    <Stop offset="80%" stopColor="#ff9800" />
                    <Stop offset="100%" stopColor="#e91e63" />
                  </LinearGradient>
                </Defs>
                <Rect
                  width="100%"
                  height="10"
                  fill="url(#speedSliderGradient)"
                  stroke={tokens.colors.bg2}
                  strokeWidth="1"
                  rx="5"
                />
                <Rect
                  x={`${value}%`}
                  y="0"
                  width="2"
                  height="10"
                  fill="white"
                  rx="1"
                />
              </Svg>
            </View>
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
              {value}%
            </Text>
          </View>
        )}
      </View>
    );
  }
);

export default SpeedSlider;
