/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { View, Text, Animated, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";

interface ScanningAnimationProps {
  /** Optional status copy; defaults to the scanning-devices string */
  message?: string;
}

/**
 * ScanningAnimation
 *
 * Displays an animated loading indicator while scanning for devices
 * @param props - Optional status message override
 * @param props.message - Optional status copy; defaults to the scanning-devices string
 * @returns Spinner and rotating graphic with translated status text
 */
export const ScanningAnimation: React.FC<ScanningAnimationProps> = ({
  message,
}) => {
  const { t } = useTranslation();
  const [rotateAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hook deps
  }, []);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View {...testProps("view_scan_ble")} style={globalStyles.scanningContainer}>
      <Animated.View
        {...testProps("view_animated")}
        style={[globalStyles.scanningIcon, { transform: [{ rotate: spin }] }]}
      >
        <ActivityIndicator size="large" color={tokens.colors.primary} />
      </Animated.View>
      <Text {...testProps("text_scanning_devices_ble")} style={globalStyles.scanningText}>
        {message ?? t("device.scan.ble.scanningDevices")}
      </Text>
    </View>
  );
};
