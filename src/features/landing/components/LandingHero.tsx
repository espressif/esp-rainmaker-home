/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Image, StyleSheet, Text } from "react-native";
import Animated, { Easing, FadeInDown } from "react-native-reanimated";
import { useTranslation } from "react-i18next";

import { resolveLogo } from "@shared/runtimeStyle/assets";
import { styleConfig } from "@shared/runtimeStyle/config";
import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";

// Shares the decelerating curve used by the option cards so the whole screen
// settles with one motion language rather than two. The explicit rise is
// larger than `FadeInDown`'s 25px default, which is too subtle to read.
const ENTER_DURATION_MS = 500;
const ENTER_OFFSET_Y = 56;

/**
 * LandingHero
 *
 * Hero for the Landing screen: the style's logo (or the bundled app logo), the
 * style's app name when set, and the style's tagline or the default subtitle.
 * Fades and rises in on mount.
 */
const LandingHero: React.FC = () => {
  const { t } = useTranslation();

  return (
    <Animated.View
      entering={FadeInDown.duration(ENTER_DURATION_MS)
        .easing(Easing.out(Easing.cubic))
        .withInitialValues({
          transform: [{ translateY: ENTER_OFFSET_Y }],
        })}
      style={styles.container}
      {...testProps("view_landing_hero")}
    >
      <Image
        {...testProps("image_landing_logo")}
        source={resolveLogo(require("@assets/images/logo.png"))}
        style={styles.logo}
        resizeMode="contain"
      />
      {styleConfig?.brandName ? (
        <Text {...testProps("text_landing_app_name")} style={styles.appName}>
          {styleConfig.brandName}
        </Text>
      ) : null}
      <Text {...testProps("text_landing_tagline")} style={styles.tagline}>
        {styleConfig?.brandTagline || t("landing.subtitle")}
      </Text>
    </Animated.View>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: tokens.spacing._20,
  },
  logo: {
    width: 150,
    height: 150,
  },
  tagline: {
    fontFamily: tokens.fonts.regular,
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text_secondary,
    textAlign: "center",
    marginTop: tokens.spacing._5,
  },
  appName: {
    fontFamily: tokens.fonts.medium,
    fontSize: tokens.fontSize.xl,
    color: tokens.colors.text_primary,
    textAlign: "center",
    marginTop: tokens.spacing._5,
  },
});

export default LandingHero;
