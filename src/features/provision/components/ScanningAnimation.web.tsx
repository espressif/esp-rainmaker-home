/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import type { ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { tokens } from "@shared/theme/tokens";
import { globalStyles } from "@shared/theme/globalStyleSheet";
import { testProps } from "@shared/utils/testProps";
import { flattenStyle } from "@shared/utils/flattenStyle";
import {
  WEB_BLE_SPIN_DURATION,
  WEB_BLE_SPIN_ITERATION,
  WEB_BLE_SPIN_KEYFRAMES_NAME,
  WEB_BLE_SPIN_STYLE_ID,
  WEB_BLE_SPIN_TIMING,
} from "@features/provision/constants";

interface ScanningAnimationProps {
  /** Optional status copy; defaults to the scanning-devices string */
  message?: string;
}

/** Web-only CSS animation fields accepted by react-native-web. */
type WebSpinStyle = ViewStyle & {
  animationName?: string;
  animationDuration?: string;
  animationTimingFunction?: string;
  animationIterationCount?: string;
};

const webSpinStyle: WebSpinStyle = {
  animationName: WEB_BLE_SPIN_KEYFRAMES_NAME,
  animationDuration: WEB_BLE_SPIN_DURATION,
  animationTimingFunction: WEB_BLE_SPIN_TIMING,
  animationIterationCount: WEB_BLE_SPIN_ITERATION,
};

/**
 * Injects CSS keyframes for the web BLE spinner once per page.
 * `Animated.View` + `transform` arrays can throw on DOM-backed renderers.
 * @returns Whether the keyframes style tag is present
 */
function ensureWebBleSpinKeyframes(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  if (document.getElementById(WEB_BLE_SPIN_STYLE_ID)) {
    return true;
  }
  const style = document.createElement("style");
  style.id = WEB_BLE_SPIN_STYLE_ID;
  style.textContent = `@keyframes ${WEB_BLE_SPIN_KEYFRAMES_NAME} { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
  return true;
}

ensureWebBleSpinKeyframes();

const WEB_BLE_SPIN_READY = ensureWebBleSpinKeyframes();

/**
 * Web scanning/connecting indicator with a CSS spinner.
 * Avoids `Animated` transform arrays that can throw on DOM-backed renderers.
 * @param props - Optional status message override
 * @param props.message - Optional status copy; defaults to the scanning-devices string
 * @returns Spinner and status text while BLE devices are discovered or paired
 */
export const ScanningAnimation: React.FC<ScanningAnimationProps> = ({
  message,
}) => {
  const { t } = useTranslation();
  const statusText = message ?? t("device.scan.ble.scanningDevices");

  return (
    <View {...testProps("view_scan_ble")} style={globalStyles.scanningContainer}>
      <View {...testProps("view_animated")} style={globalStyles.scanningIcon}>
        {WEB_BLE_SPIN_READY ? (
          <View
            {...testProps("view_web_ble_spinner")}
            style={flattenStyle([styles.spinner, webSpinStyle])}
          />
        ) : (
          <ActivityIndicator size="large" color={tokens.colors.primary} />
        )}
      </View>
      <Text
        {...testProps("text_scanning_devices_ble")}
        style={globalStyles.scanningText}
      >
        {statusText}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  spinner: {
    width: tokens.spacing._40,
    height: tokens.spacing._40,
    borderRadius: tokens.spacing._20,
    borderWidth: tokens.spacing._5,
    borderColor: tokens.colors.bg2,
    borderTopColor: tokens.colors.primary,
  },
});
