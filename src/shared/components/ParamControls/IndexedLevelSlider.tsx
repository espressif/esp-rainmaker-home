/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { View, Text, GestureResponderEvent } from "react-native";

import { Slider } from "tamagui";
import { observer } from "mobx-react-lite";

import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";
import {
  ParamControlChildProps,
  comparableRoundedParamNumber,
  snapSliderValue,
} from "./lib/types";
import { paramControlStyles as styles } from "./lib/styles";
import { useDragBubble } from "./lib/useDragBubble";

/**
 * Resolves the display label for a discrete level.
 * @param level - Level value on the wire (the slider position).
 * @param labels - Optional per-value labels from param `meta`.
 * @returns Human-readable level label.
 */
function formatIndexedLevelLabel(
  level: number,
  labels?: Record<string, string>,
): string {
  const mapped = labels?.[String(level)];
  if (mapped) {
    return mapped;
  }

  return `Level ${level + 1}`;
}

/**
 * IndexedLevelSlider
 *
 * Discrete slider for indexed appliance settings (fan/AC speed, laundry spin
 * speed). `meta.labels` is indexed by the param's own value and is fed from
 * the param's declared `valid_values`, so a speed of 0..3 reads
 * Off / Low / Medium / High instead of "Level 1". A param that declares no
 * values keeps the 1-based "Level N" fallback.
 * @param label - Param label shown above the control.
 * @param value - Current level value.
 * @param onValueChange - Callback when the user selects a new level.
 * @param disabled - Whether interaction is disabled.
 * @param meta - Bounds (`min`, `max`, `step`) and the value → label map.
 * @param compact - Compact one-row layout for dense device panels.
 * @returns Discrete level slider for indexed appliance attributes.
 */
const IndexedLevelSlider = observer(
  ({
    label,
    value,
    onValueChange = () => {},
    disabled,
    meta = { min: 0, max: 15, step: 1 },
    compact = false,
  }: ParamControlChildProps) => {
    const { min, max, step = 1 } = meta;
    const labels =
      meta && typeof meta.labels === "object" && meta.labels !== null
        ? (meta.labels as Record<string, string>)
        : undefined;

    const n = Number(value);
    const displayValue = Number.isFinite(n)
      ? snapSliderValue(n, min, max, step)
      : min;
    const displayLabel = formatIndexedLevelLabel(displayValue, labels);

    const { isDragging, onSlideStart, onSlideTick, onSlideEnd } =
      useDragBubble();

    /**
     * Commits a snapped discrete level after the user drags the thumb.
     * @param event - Gesture event from Tamagui Slider.
     * @param newValue - Raw slider reading.
     */
    const commitValue = (
      event: GestureResponderEvent | null,
      newValue: number,
    ) => {
      onSlideTick();
      if (disabled) {
        return;
      }

      const snappedValue = snapSliderValue(newValue, min, max, step);
      const cur = comparableRoundedParamNumber(value);
      if (cur !== null && snappedValue === cur) {
        return;
      }

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
            <Text style={styles.compactValue}>{displayLabel}</Text>
          </View>
        ) : (
          <>
            <Text
              style={[styles.sliderLabel, disabled && styles.disabledText]}
            >
              {label}
            </Text>

            <View style={styles.rangeRow}>
              <Text style={styles.value}>
                {formatIndexedLevelLabel(min, labels)}
              </Text>
              <Text style={styles.value}>
                {formatIndexedLevelLabel(max, labels)}
              </Text>
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
                <Text style={styles.bubbleText}>{displayLabel}</Text>
              </View>
              <View style={styles.bubbleArrow} />
            </View>
          )}

          <View
            style={styles.sliderContainer}
            {...testProps(`indexed-level-slider_${label}`)}
          >
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
                    { backgroundColor: tokens.colors.primary },
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
              {displayLabel}
            </Text>
          </View>
        )}
      </View>
    );
  },
);

export default IndexedLevelSlider;
