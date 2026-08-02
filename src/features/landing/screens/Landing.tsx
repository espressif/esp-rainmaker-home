/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";

import { PLATFORM_OPTIONS } from "@features/landing/config/platformOptions";
import { useLanding } from "@features/landing/hooks";
import { LandingHero, PlatformOptionCard } from "@features/landing/components";

// Soft brand hero: light blue at the top fading to white where the logo sits,
// so the logo's dark wordmark stays legible without a backing badge.
const HERO_GRADIENT = ["#CFE0F5", "#EAF1FB", "#FFFFFF"] as const;
const HERO_GRADIENT_LOCATIONS = [0, 0.6, 1] as const;

/**
 * Landing screen (global region): pick which backend platform to use before
 * signing in — ESP RainMaker Classic, ESP RainMaker Neo, or a custom
 * deployment via QR config scan.
 */
export function LandingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { selectPlatform } = useLanding();

  // Hide the private-deployment option when config scanning is disabled for
  // the build (matches the logo-tap gesture gating in <Logo />).
  const options = useMemo(() => {
    const scanEnabled = !!Constants.expoConfig?.extra?.enableScanConfiguration;
    return PLATFORM_OPTIONS.filter(
      (o) => o.kind !== "ownDeployment" || scanEnabled,
    );
  }, []);

  // When Landing is opened from Login (via the deployment banner) we're on
  // top of a nav stack — offer a back affordance. First-launch cold boots
  // reach Landing via `router.replace`, so `canGoBack()` is false and the
  // button stays hidden.
  const canDismiss = router.canGoBack();

  return (
    <View style={styles.root} {...testProps("view_landing")}>
      <StatusBar style="dark" />

      <LinearGradient
        colors={HERO_GRADIENT}
        locations={HERO_GRADIENT_LOCATIONS}
        style={[styles.hero, { paddingTop: insets.top + tokens.spacing._40 }]}
      >
        {canDismiss && (
          <TouchableOpacity
            {...testProps("button_landing_back")}
            onPress={() => router.back()}
            style={[styles.backButton, { top: insets.top + tokens.spacing._10 }]}
            hitSlop={tokens.spacing._10}
          >
            <Ionicons
              name="close"
              size={tokens.iconSize._20}
              color={tokens.colors.text_primary}
            />
          </TouchableOpacity>
        )}
        <LandingHero />
      </LinearGradient>

      <View
        style={[
          styles.cards,
          { paddingBottom: insets.bottom + tokens.spacing._20 },
        ]}
      >
        {options.map((option, index) => (
          <PlatformOptionCard
            key={option.kind}
            option={option}
            index={index}
            onPress={() => selectPlatform(option)}
          />
        ))}
      </View>
    </View>
  );
}

/* ------------------------------ Styles ------------------------------- */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.colors.white,
  },
  hero: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: tokens.spacing._40,
  },
  cards: {
    flex: 1,
    paddingHorizontal: tokens.spacing._20,
    paddingTop: tokens.spacing._30,
    gap: tokens.spacing._15,
  },
  backButton: {
    position: "absolute",
    right: tokens.spacing._20,
    zIndex: 1,
    padding: tokens.spacing._5,
  },
});
