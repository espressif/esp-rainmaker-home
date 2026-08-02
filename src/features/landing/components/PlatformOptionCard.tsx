/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { Easing, FadeInLeft } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";

import type { PlatformOption } from "../config/platformOptions";

// Entrance: cards ease in from a short distance left, staggered after the
// hero. Offset picks a middle ground — SlideInLeft's full-width travel jolts,
// FadeInLeft's default 25px barely registers.
const ENTER_BASE_DELAY_MS = 180;
const ENTER_STAGGER_MS = 90;
const ENTER_DURATION_MS = 400;
const ENTER_OFFSET_X = -96;

const LOGO_BOX_HEIGHT = 50;
const LOGO_BOX_WIDTH = 60;
const MARK_SLOT_SIZE = 60;
const ICON_GLYPH_SIZE = 32;

interface PlatformOptionCardProps {
  option: PlatformOption;
  /** Position in the list, drives the staggered entrance delay. */
  index: number;
  onPress: () => void;
}

/**
 * PlatformOptionCard
 *
 * Reusable Landing option panel: colored surface, brand mark (or accent glyph),
 * title (plus a subtitle where the option defines one) and a trailing arrow.
 * Fully driven by a
 * {@link PlatformOption}, so the screen renders the whole list with one `.map()`.
 */
const PlatformOptionCard: React.FC<PlatformOptionCardProps> = ({
  option,
  index,
  onPress,
}) => {
  const { t } = useTranslation();

  return (
    <Animated.View
      entering={FadeInLeft.delay(
        ENTER_BASE_DELAY_MS + index * ENTER_STAGGER_MS,
      )
        .duration(ENTER_DURATION_MS)
        .easing(Easing.out(Easing.cubic))
        .withInitialValues({
          transform: [{ translateX: ENTER_OFFSET_X }],
        })}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={[styles.card, { backgroundColor: option.bgColor }]}
        {...testProps(`button_${option.qaId}`)}
      >
        <View style={styles.markSlot}>
          {option.logo ? (
            <Image
              {...testProps(`image_${option.qaId}`)}
              source={option.logo}
              style={styles.markImage}
              resizeMode="contain"
              resizeMethod="resize"
            />
          ) : (
            <Ionicons
              name={option.icon}
              size={ICON_GLYPH_SIZE}
              color={option.accentColor}
            />
          )}
        </View>

        <View style={styles.texts} {...testProps("view_title")}>
          <Text
            {...testProps(`text_title_${option.qaId}`)}
            style={[styles.title, { color: option.titleColor }]}
          >
            {t(option.titleKey)}
          </Text>
          {option.subtitleKey && (
            <Text
              {...testProps(`text_subtitle_${option.qaId}`)}
              style={[styles.subtitle, { color: option.subtitleColor }]}
            >
              {t(option.subtitleKey)}
            </Text>
          )}
        </View>

        <Ionicons
          name="arrow-forward"
          size={18}
          color={option.accentColor}
        />
      </TouchableOpacity>
    </Animated.View>
  );
};

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._15,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: tokens.radius.md,
  },
  markSlot: {
    width: MARK_SLOT_SIZE,
    height: MARK_SLOT_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  markImage: {
    width: LOGO_BOX_WIDTH,
    height: LOGO_BOX_HEIGHT,
  },
  texts: {
    flex: 1,
  },
  title: {
    fontFamily: tokens.fonts.medium,
    fontSize: tokens.fontSize.md,
    fontWeight: "500",
  },
  subtitle: {
    fontFamily: tokens.fonts.regular,
    fontSize: tokens.fontSize.xs,
    marginTop: 2,
  },
});

export default PlatformOptionCard;
