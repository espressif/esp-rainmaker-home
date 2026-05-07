/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from "react";
import { View, Text, GestureResponderEvent } from "react-native";

// Components
import { Slider } from "tamagui";
import { observer } from "mobx-react-lite";

// Types & Styles
import {
  ParamControlChildProps,
  clampValue,
  comparableRoundedParamNumber,
} from "./lib/types";
import { paramControlStyles as styles } from "./lib/styles";
import { useDragBubble } from "./lib/useDragBubble";
import { tokens } from "@shared/theme/tokens";

/**
 * BrightnessSlider
 *
 * A slider component for controlling device brightness parameter.
 * Displays current brightness value and allows adjustment through a slider.
 * @param param - The device parameter to control
 * @param disabled - Whether the control is disabled
 * @returns Brightness slider with percent display and clamped values
 */
const BRIGHTNESS_DEFAULTS = { min: 0, max: 100, step: 1 };

const BrightnessSlider = observer(
  ({
    label,
    value,
    onValueChange = () => {},
    disabled,
    meta = BRIGHTNESS_DEFAULTS,
    compact = false,
  }: ParamControlChildProps) => {
    const rawMin = meta?.min;
    const rawMax = meta?.max;
    const rawStep = meta?.step;
    const min =
      typeof rawMin === "number" && Number.isFinite(rawMin)
        ? rawMin
        : BRIGHTNESS_DEFAULTS.min;
    const max =
      typeof rawMax === "number" && Number.isFinite(rawMax)
        ? rawMax
        : BRIGHTNESS_DEFAULTS.max;
    const step =
      typeof rawStep === "number" &&
      Number.isFinite(rawStep) &&
      rawStep > 0
        ? rawStep
        : BRIGHTNESS_DEFAULTS.step;

    const n = Number(value);
    const clamped = Number.isFinite(n)
      ? clampValue(Math.round(n), min, max)
      : min;
    const sliderValue = useMemo(() => [clamped], [clamped]);

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
      onValueChange(event, roundedValue);
    };

    const thumbPercent = max > min ? ((clamped - min) / (max - min)) * 100 : 0;

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
            <Text style={styles.compactValue}>{clamped}%</Text>
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
                <Text style={styles.bubbleText}>{clamped}%</Text>
              </View>
              <View style={styles.bubbleArrow} />
            </View>
          )}

          <View style={styles.sliderContainer}>
            <Slider
              value={sliderValue}
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
                  { backgroundColor: tokens.colors.bg2 },
                ]}
              >
                <Slider.TrackActive
                  style={[
                    styles.trackActive,
                    styles.trackSmall,
                    { backgroundColor: tokens.colors.blue },
                  ]}
                />
              </Slider.Track>
              <Slider.Thumb
                index={0}
                style={[
                  styles.thumb,
                  styles.thumbSmall,
                  disabled && styles.disabled,
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
              {clamped}%
            </Text>
          </View>
        )}
      </View>
    );
  }
);

export default BrightnessSlider;
