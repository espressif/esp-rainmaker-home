/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  Image,
  ImageSourcePropType,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Constants from "expo-constants";

// Styles
import { tokens } from "@shared/theme/tokens";

import { testProps } from "@shared/utils/testProps";
import { useMultiTap } from "../../hooks/useMultiTap";

const CONFIG_SCAN_TRIGGER = 5;
const CONFIG_RESET_TRIGGER = 10;
const TAP_WINDOW_MS = 1000;
const MARK_HEIGHT_RATIO = 0.6;
const WORDMARK_ASPECT = 1129 / 213;

/**
 * Master switch for the hidden logo tap gestures (5-tap config scan, 10-tap config
 * reset). Disabled: the Landing deployment picker is the supported entry point.
 * The triggers and callbacks stay wired, so `true` restores both gestures.
 */
const TAP_GESTURES_ENABLED = false;

// Types
interface LogoProps {
  /** Size of the logo in pixels */
  size?: number;
  /** QA automation identifier */
  qaId?: string;
  caption?: string;
  captionSource?: ImageSourcePropType;
  /** Called after 5 rapid taps (config scan). Inert while gestures are disabled. */
  onConfigTrigger?: () => void;
  /** Called after 10 rapid taps (config reset). Inert while gestures are disabled. */
  onConfigReset?: () => void;
}

/**
 * Logo
 *
 * A component for displaying the app logo with customizable size.
 * Features:
 * - Configurable size
 * - Maintains aspect ratio
 * - Consistent bottom margin
 * - Full lockup by default; house mark + deployment caption when one is given
 * - Optional (currently DISABLED, see TAP_GESTURES_ENABLED): 5 taps opens
 *   config scan, 10 taps resets runtime config
 */
const Logo: React.FC<LogoProps> = ({
  size = 180,
  qaId,
  caption,
  captionSource,
  onConfigTrigger,
  onConfigReset,
}) => {
  const handleTap = useMultiTap({
    windowMs: TAP_WINDOW_MS,
    triggers: [
      { count: CONFIG_RESET_TRIGGER, action: () => onConfigReset?.() },
      { count: CONFIG_SCAN_TRIGGER, action: () => onConfigTrigger?.() },
    ],
  });

  const hasCaption = Boolean(captionSource || caption);

  const image = hasCaption ? (
    <View style={styles(size).captioned}>
      <Image
        {...(qaId ? testProps(qaId) : {})}
        style={styles(size).mark}
        resizeMode="contain"
        resizeMethod="scale"
        source={require("@assets/images/logo-mark.png")}
      />
      {captionSource ? (
        <Image
          {...testProps("image_logo_caption")}
          style={styles(size).captionMark}
          resizeMode="contain"
          resizeMethod="resize"
          source={captionSource}
          accessible={Boolean(caption)}
          accessibilityRole="image"
          accessibilityLabel={caption}
        />
      ) : (
        <Text {...testProps("text_logo_caption")} style={styles(size).caption}>
          {caption}
        </Text>
      )}
    </View>
  ) : (
    <Image
      {...(qaId ? testProps(qaId) : {})}
      style={styles(size).logo}
      resizeMethod="scale"
      source={require("@assets/images/logo.png")}
    />
  );

  // Overrides the guards below: no touch target at all while disabled.
  if (!TAP_GESTURES_ENABLED) {
    return image;
  }

  if (!Constants.expoConfig?.extra?.enableScanConfiguration) {
    return image;
  }

  if (!onConfigTrigger && !onConfigReset) {
    return image;
  }

  return (
    <TouchableOpacity onPress={handleTap} activeOpacity={1}>
      {image}
    </TouchableOpacity>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = (size: number) =>
  StyleSheet.create({
    logo: {
      width: size,
      height: size,
      marginBottom: tokens.spacing._20,
    },
    captioned: {
      alignItems: "center",
      marginBottom: tokens.spacing._20,
    },
    mark: {
      width: size,
      height: size * MARK_HEIGHT_RATIO,
    },
    caption: {
      fontFamily: tokens.fonts.medium,
      fontSize: tokens.fontSize.lg,
      color: tokens.colors.text_primary,
      textAlign: "center",
      marginTop: tokens.spacing._10,
    },
    captionMark: {
      width: size,
      height: size / WORDMARK_ASPECT,
      marginTop: tokens.spacing._10,
    },
  });

export default Logo;
