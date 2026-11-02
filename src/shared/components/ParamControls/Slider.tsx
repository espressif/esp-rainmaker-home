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
import { testProps } from "@shared/utils/testProps";
import { resolveParamUnitSymbol } from "@shared/utils/paramUnits";

/**
 * SliderControl
 *
 * A basic slider component for controlling numeric parameters.
 * Provides a simple slider interface with current value display.
 *
 * This is the one slider whose quantity is unknown up front — the purpose-built
 * ones (brightness, volume, CCT) carry their unit in their identity — so a
 * declared unit is shown on every number it prints. An undeclared unit renders
 * the bare number, exactly as before.
 * @param param - The device parameter to control
 * @param disabled - Whether the control is disabled
 * @param meta - Bounds (`min`, `max`, `step`) and the declared `unit` token.
 * @returns Generic labeled slider with min/max from `meta`
 */
const SliderControl = observer(
  ({
    label,
    value,
    onValueChange = () => {},
    disabled,
    meta = { min: 0, max: 100, step: 1 },
    compact = false,
  }: ParamControlChildProps) => {
    const { min, max, step = 1 } = meta;
    const unitSymbol = resolveParamUnitSymbol(meta?.unit);

    const n = Number(value);
    const displayValue = Number.isFinite(n)
      ? snapSliderValue(n, min, max, step)
      : min;

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
            <Text
              {...testProps(`slider_${label}_value`)}
              style={styles.compactValue}
            >{`${value}${unitSymbol}`}</Text>
          </View>
        ) : (
          <>
            <Text
              style={[styles.sliderLabel, disabled && styles.disabledText]}
            >
              {label}
            </Text>

            <View style={styles.rangeRow}>
              <Text style={styles.value}>{`${min}${unitSymbol}`}</Text>
              <Text style={styles.value}>{`${max}${unitSymbol}`}</Text>
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
                <Text style={styles.bubbleText}>{`${displayValue}${unitSymbol}`}</Text>
              </View>
              <View style={styles.bubbleArrow} />
            </View>
          )}

          <View style={styles.sliderContainer} {...testProps(`slider_${label}`)}>
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
              {...testProps(`slider_${label}_value`)}
              style={[
                styles.thumbValueText,
                {
                  left: `${thumbPercent}%`,
                  transform: [{ translateX: -(40 * thumbPercent) / 100 }],
                  opacity: isDragging ? 0 : 1,
                },
              ]}
            >{`${displayValue}${unitSymbol}`}</Text>
          </View>
        )}
      </View>
    );
  }
);

export default SliderControl;
