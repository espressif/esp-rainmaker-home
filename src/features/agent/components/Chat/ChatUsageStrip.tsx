/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { tokens } from "@shared/theme/tokens";
import { AGENT_USAGE_STRIPE_HEIGHT } from "@features/agent/utils/constants";
import {
  formatCompactCount,
  getUsageStripeGradient,
} from "@features/agent/utils/formatCompactCount";
import type { UsageQuota } from "@features/agent/utils/types";

interface ChatUsageStripProps {
  usage: UsageQuota;
}

/**
 * Thin usage quota stripe shown above the chat composer.
 * Displays used count and total quota with a color-coded fill bar.
 * @param props - Component props.
 * @param props.usage - Current usage quota from the agents API.
 * @returns Usage stripe UI or null when quota data is unavailable.
 */
export const ChatUsageStrip: React.FC<ChatUsageStripProps> = ({ usage }) => {
  const fillPercent = Math.max(0, Math.min(100, usage.percentage));
  const gradientColors = useMemo(
    () => getUsageStripeGradient(fillPercent),
    [fillPercent],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{formatCompactCount(usage.currentUsage)}</Text>

      <View style={styles.track}>
        <View style={styles.trackLine} />
        <LinearGradient
          colors={[...gradientColors]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { width: `${fillPercent}%` }]}
        />
      </View>

      <Text style={styles.label}>{formatCompactCount(usage.limit)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._5,
    paddingHorizontal: tokens.spacing._15,
    paddingTop: tokens.spacing._5,
    paddingBottom: tokens.spacing._5,
  },
  label: {
    fontSize: 10,
    lineHeight: 12,
    color: tokens.colors.text_secondary,
    minWidth: 28,
    textAlign: "center",
  },
  track: {
    flex: 1,
    height: AGENT_USAGE_STRIPE_HEIGHT,
    justifyContent: "center",
  },
  trackLine: {
    ...StyleSheet.absoluteFillObject,
    height: AGENT_USAGE_STRIPE_HEIGHT,
    borderRadius: AGENT_USAGE_STRIPE_HEIGHT / 2,
    backgroundColor: tokens.colors.bg3,
    opacity: 0.35,
  },
  fill: {
    height: AGENT_USAGE_STRIPE_HEIGHT,
    borderRadius: AGENT_USAGE_STRIPE_HEIGHT / 2,
  },
});
