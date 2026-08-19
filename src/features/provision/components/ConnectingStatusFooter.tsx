/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";

import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";
import {
  GRADIENT_WHITE_CLEAR,
  GRADIENT_WHITE_SOFT,
} from "@features/provision/constants";

/**
 * ConnectingStatusFooter
 *
 * Button-sized white footer row shown while provisioning after a QR hit:
 * “Connecting to device” in primary color with a skeleton-like shimmer.
 * On iOS, gradient clear stops must be white@0 (not `"transparent"`) or
 * CAGradientLayer paints a black left–right sweep.
 * @returns Shimmering connecting-status footer row
 */
export const ConnectingStatusFooter = () => {
  const { t } = useTranslation();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, {
        duration: 1400,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      false,
    );
  }, [shimmer]);

  const shimmerSlideStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: -40 + shimmer.value * 220,
      },
    ],
  }));

  const textPulseStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + Math.sin(shimmer.value * Math.PI) * 0.45,
  }));

  // iOS: never use CSS `transparent` in LinearGradient — it interpolates as black.
  // Android accepts the same clear-white stops, so use them on both platforms.
  const shimmerColors = [
    GRADIENT_WHITE_CLEAR,
    GRADIENT_WHITE_SOFT,
    GRADIENT_WHITE_CLEAR,
  ] as const;

  return (
    <View
      {...testProps("view_connecting_device")}
      style={globalStyles.connectingStatusButton}
    >
      <View style={globalStyles.connectingStatusTextWrap}>
        <Reanimated.Text
          {...testProps("text_connecting_device")}
          style={[globalStyles.connectingStatusText, textPulseStyle]}
        >
          {t("device.scan.qr.connectingToDevice")}
        </Reanimated.Text>
        <Reanimated.View
          pointerEvents="none"
          style={[globalStyles.connectingShimmerSweep, shimmerSlideStyle]}
        >
          <LinearGradient
            colors={[...shimmerColors]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={globalStyles.connectingShimmerGradient}
          />
        </Reanimated.View>
      </View>
    </View>
  );
};
