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
  snapSliderValue,
} from "./lib/types";
import { paramControlStyles as styles } from "./lib/styles";
import { useDragBubble } from "./lib/useDragBubble";
import { testProps } from "@shared/utils/testProps";


/**
 * SaturationSlider
 *
 * A slider component for controlling color saturation.
 * Features a gradient background representing saturation levels
 * and displays the current value as a percentage.
 * @param param - The device parameter to control
 * @param disabled - Whether the control is disabled
 * @returns Saturation slider with HSL preview and clamped commits
 */
const SaturationSlider = observer(
  ({
    label,
    value,
    onValueChange = () => {},
    disabled,
    meta = { min: 0, max: 100, step: 1 },
    compact = false,
  }: ParamControlChildProps) => {
    const { min, max, step = 1, hue = 0, brightness = 50 } = meta;

    const n = Number(value);
    const displayValue = Number.isFinite(n)
      ? snapSliderValue(n, min, max, step)
      : min;

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
            <Text {...testProps(`slider_${label}_value`)} style={styles.compactValue}>{value}%</Text>
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
                <Text style={styles.bubbleText}>{value}</Text>
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
                  height="10"
                  fill="url(#saturationSliderGradient)"
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
                  transform: [{ translateX: -(40 * thumbPercent) / 100 }],
                  opacity: isDragging ? 0 : 1,
                },
              ]}
            >
              {value}
            </Text>
          </View>
        )}
      </View>
    );
  }
);

export default SaturationSlider;
