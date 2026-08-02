/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useId } from "react";
import { View, Text, GestureResponderEvent } from "react-native";

// Components
import { Slider } from "tamagui";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { observer } from "mobx-react-lite";

// Styles
import { tokens } from "@shared/theme/tokens";

// Types
import {
  ParamControlChildProps,
  comparableRoundedParamNumber,
  snapSliderValue,
} from "./lib/types";
import { paramControlStyles as styles } from "./lib/styles";
import { useDragBubble } from "./lib/useDragBubble";
import { testProps } from "@shared/utils/testProps";
import {
  CCT_KELVIN_MAX,
  CCT_KELVIN_MIN,
  CCT_KELVIN_STEP,
} from "@shared/utils/constants";

/**
 * ColorTemperatureSlider
 *
 * A slider component for controlling color temperature of a light.
 * Features a gradient background representing warm to cool temperatures
 * and displays the current value in Kelvin.
 * Device `bounds.min` below {@link CCT_KELVIN_MIN} is floored so the warm end
 * never goes under 2700K.
 * @param param - The device parameter to control
 * @param disabled - Whether the control is disabled
 * @returns Color-temperature slider (K) with rounded commits
 */
const KELVIN_DEFAULTS = {
  min: CCT_KELVIN_MIN,
  max: CCT_KELVIN_MAX,
  step: CCT_KELVIN_STEP,
};

const ColorTemperatureSlider = observer(
  ({
    label,
    value,
    onValueChange = () => {},
    disabled,
    meta = KELVIN_DEFAULTS,
    compact = false,
  }: ParamControlChildProps) => {
    const rawMin = meta?.min;
    const rawMax = meta?.max;
    const rawStep = meta?.step;

    // Prefer device max; always enforce a Kelvin floor so CCT cannot start below 2700K.
    let min =
      typeof rawMin === "number" && Number.isFinite(rawMin)
        ? Math.max(rawMin, CCT_KELVIN_MIN)
        : KELVIN_DEFAULTS.min;
    let max =
      typeof rawMax === "number" && Number.isFinite(rawMax)
        ? rawMax
        : KELVIN_DEFAULTS.max;
    if (max <= min) {
      min = KELVIN_DEFAULTS.min;
      max = KELVIN_DEFAULTS.max;
    }

    const step =
      typeof rawStep === "number" &&
      Number.isFinite(rawStep) &&
      rawStep > 0
        ? rawStep
        : KELVIN_DEFAULTS.step;

    const n = Number(value);
    const clamped = Number.isFinite(n)
      ? snapSliderValue(n, min, max, step)
      : snapSliderValue(min + (max - min) / 2, min, max, step);

    const sliderValue = useMemo(() => [clamped], [clamped]);
    const gradientId = `ctg-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

    const { isDragging, onSlideStart, onSlideTick, onSlideEnd } =
      useDragBubble();

    const commitValue = (
      event: GestureResponderEvent | null,
      newValue: number,
    ) => {
      onSlideTick();
      if (disabled) return;
      const snappedValue = snapSliderValue(newValue, min, max, step);
      const cur = comparableRoundedParamNumber(value);
      if (cur !== null && snappedValue === cur) return;
      onValueChange(event, snappedValue);
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
            <Text {...testProps(`slider_${label}_value`)} style={styles.compactValue}>{clamped}K</Text>
          </View>
        ) : (
          <>
            <Text
              style={[styles.sliderLabel, disabled && styles.disabledText]}
            >
              {label}
            </Text>

            <View style={styles.rangeRow}>
              <Text style={styles.value}>{min}K</Text>
              <Text style={styles.value}>{max}K</Text>
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
                  transform: [{ translateX: -28 }],
                },
              ]}
            >
              <View style={[styles.bubble, { minWidth: 56 }]}>
                <Text style={styles.bubbleText}>{clamped}K</Text>
              </View>
              <View style={styles.bubbleArrow} />
            </View>
          )}

          <View style={styles.sliderContainer} {...testProps(`slider_${label}`)}>
            <Slider
              value={sliderValue}
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

            <View style={[styles.gradientOverlay, { top: 10 }]}>
              <Svg width="100%" height="10" style={styles.gradientSvg}>
                <Defs>
                  <LinearGradient
                    id={gradientId}
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
                  height="10"
                  fill={`url(#${gradientId})`}
                  stroke={tokens.colors.bg2}
                  strokeWidth="1"
                  rx="5"
                />
              </Svg>
            </View>
          </View>
        </View>

        {!compact && (
          <View style={styles.thumbValueContainer}>
            <Text
              {...testProps(`slider_${label}_value`)}
              style={[
                styles.thumbValueText,
                {
                  left: `${thumbPercent}%`,
                  transform: [{ translateX: -(48 * thumbPercent) / 100 }],
                  width: 48,
                  opacity: isDragging ? 0 : 1,
                },
              ]}
            >
              {clamped}K
            </Text>
          </View>
        )}
      </View>
    );
  }
);

export default ColorTemperatureSlider;
