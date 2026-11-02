/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { tokens } from "@shared/theme/tokens";

/** Arc brightness at rest, so an idle glyph and a resting wave sit level. */
const ARC_REST_OPACITY = 0.45;
/** One wave: arcs brighten, fade back, then hold before the next goes out. */
const WAVE_RISE_MS = 290;
const WAVE_FALL_MS = 590;
const WAVE_HOLD_MS = 720;
/** How far behind the inner pair the outer pair lights, so the wave travels. */
const WAVE_STAGGER_MS = 180;
/** Settle back to rest rather than cutting when the window ends. */
const WAVE_SETTLE_MS = 180;

/** Lucide `Radio`: a core with two arc pairs stepping outward. */
const ARCS_INNER = [
  "M16.247 7.761a6 6 0 0 1 0 8.478",
  "M7.753 16.239a6 6 0 0 1 0-8.478",
];
const ARCS_OUTER = [
  "M19.075 4.933a10 10 0 0 1 0 14.134",
  "M4.925 19.067a10 10 0 0 1 0-14.134",
];

export interface IdentifyGlyphProps {
  /** True while the device is identifying; drives the outward wave */
  isIdentifying: boolean;
  /** Glyph size in points */
  size?: number;
  /** Stroke and core colour */
  color?: string;
}

/**
 * Broadcast glyph whose arcs light outward while a device identifies itself.
 * @param props - Busy state, size and colour
 * @returns Animated glyph sized to `size`
 */
const IdentifyGlyph: React.FC<IdentifyGlyphProps> = ({
  isIdentifying,
  size = 18,
  color = tokens.colors.white,
}) => {
  const innerWave = useSharedValue(0);
  const outerWave = useSharedValue(0);

  useEffect(() => {
    if (!isIdentifying) {
      cancelAnimation(innerWave);
      cancelAnimation(outerWave);
      innerWave.value = withTiming(0, { duration: WAVE_SETTLE_MS });
      outerWave.value = withTiming(0, { duration: WAVE_SETTLE_MS });
      return;
    }
    const wave = () =>
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: WAVE_RISE_MS,
            easing: Easing.out(Easing.ease),
          }),
          withTiming(0, {
            duration: WAVE_FALL_MS,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(0, { duration: WAVE_HOLD_MS }),
        ),
        -1,
        false,
      );
    innerWave.value = wave();
    outerWave.value = withDelay(WAVE_STAGGER_MS, wave());
  }, [innerWave, isIdentifying, outerWave]);

  const innerStyle = useAnimatedStyle(() => ({
    opacity: ARC_REST_OPACITY + innerWave.value * (1 - ARC_REST_OPACITY),
  }));
  const outerStyle = useAnimatedStyle(() => ({
    opacity: ARC_REST_OPACITY + outerWave.value * (1 - ARC_REST_OPACITY),
  }));

  const stroke = {
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={2} fill={color} />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, innerStyle]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          {ARCS_INNER.map((d) => (
            <Path key={d} d={d} {...stroke} />
          ))}
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, outerStyle]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          {ARCS_OUTER.map((d) => (
            <Path key={d} d={d} {...stroke} />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
};

export default IdentifyGlyph;
