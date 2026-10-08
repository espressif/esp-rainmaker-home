/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Pressable, StyleSheet, Text, View } from "react-native";
import { RotateCcw, ChevronLeft } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { tokens } from "@shared/theme/tokens";
import { testProps } from "@shared/utils/testProps";

export interface EmbedFrameControlsProps {
  /** Navigates back in the embedded app history */
  onBack: () => void;
  /** Reloads the embedded app from the root URL */
  onRefresh: () => void;
}

/**
 * Controls outside the iPhone chassis: back (iframe history) and refresh (reload).
 * @param props - Control callbacks
 * @param props.onBack - Go back inside the embed
 * @param props.onRefresh - Hard-refresh the embed iframe
 */
export function EmbedFrameControls({
  onBack,
  onRefresh,
}: EmbedFrameControlsProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.row} accessibilityLabel={t("embed.frame.a11y.controls")}>
      <Pressable
        {...testProps("button_embed_back")}
        onPress={onBack}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={t("embed.frame.a11y.back")}
      >
        <ChevronLeft size={tokens.iconSize._15} color={tokens.colors.black} />
        <Text style={styles.label}>{t("layout.shared.back")}</Text>
      </Pressable>
      <Pressable
        {...testProps("button_embed_refresh")}
        onPress={onRefresh}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={t("embed.frame.a11y.refresh")}
      >
        <RotateCcw size={tokens.iconSize._15} color={tokens.colors.black} />
        <Text style={styles.label}>{t("layout.shared.refresh")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacing._10,
    marginBottom: tokens.spacing._15,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._5,
    paddingVertical: tokens.spacing._10,
    paddingHorizontal: tokens.spacing._15,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.white,
    borderWidth: 1,
    borderColor: tokens.colors.borderColor,
  },
  pressed: {
    opacity: 0.75,
  },
  label: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.black,
  },
});
