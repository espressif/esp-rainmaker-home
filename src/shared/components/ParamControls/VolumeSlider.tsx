/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, GestureResponderEvent } from "react-native";

// Components
import { Slider } from "tamagui";
import { observer } from "mobx-react-lite";

// Types & Styles
import {
  ParamControlChildProps,
  comparableRoundedParamNumber,
  snapSliderValue,
} from "./lib/types";
import { paramControlStyles as styles } from "./lib/styles";
import { useDragBubble } from "./lib/useDragBubble";
import { tokens } from "@shared/theme/tokens";

/**
 * VolumeSlider
 *
 * A slider component for controlling volume levels.
 * Displays current volume value and allows adjustment through a slider.
 * @param param - The device parameter to control
 * @param disabled - Whether the control is disabled
 * @returns Volume slider with percent label and clamped writes
 */
const VolumeSlider = observer(
  ({
    label,
    value,
    onValueChange = () => {},
    disabled,
    meta = { min: 0, max: 100, step: 1 },
    compact = false,
  }: ParamControlChildProps) => {
    // 1. Computed Values
    const { min, max, step = 1 } = meta;

    const n = Number(value);
    const displayValue = Number.isFinite(n)
      ? snapSliderValue(n, min, max, step)
      : min;

    // 2. Handlers
    const { isDragging, onSlideStart, onSlideTick, onSlideEnd } =
      useDragBubble();

    /**
     * Commits a snapped slider value so near-edge drags can reach min/max.
     * @param event - Gesture event from Tamagui Slider
     * @param newValue - Raw slider reading
     */
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

    const thumbPercent =
      max > min ? ((displayValue - min) / (max - min)) * 100 : 0;

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
            <Text style={styles.compactValue}>{displayValue}%</Text>
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
                <Text style={styles.bubbleText}>{displayValue}%</Text>
              </View>
              <View style={styles.bubbleArrow} />
            </View>
          )}

          <View style={styles.sliderContainer}>
            <Slider
              value={[displayValue]}
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
              {displayValue}%
            </Text>
          </View>
        )}
      </View>
    );
  }
);

export default VolumeSlider;
