/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Image, StyleSheet, Text } from "react-native";
import Animated, { Easing, FadeInDown } from "react-native-reanimated";
import { useTranslation } from "react-i18next";

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
 * Branded hero for the Landing screen. The app logo (which already carries the
 * "ESP RainMaker Home" wordmark) is shown large on the light top of the soft
 * gradient — no backing badge — with a short tagline below. Fades/rises in.
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
        source={require("@assets/images/logo.png")}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text {...testProps("text_landing_tagline")} style={styles.tagline}>
        {t("landing.subtitle")}
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
});

export default LandingHero;
