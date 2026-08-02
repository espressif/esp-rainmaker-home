/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet } from "react-native";
import { tokens } from "./tokens";

/**
 * Styles for the revamped time-series chart screen
 * (granularity tabs, window summary header, bar chart, footnotes).
 */
export const chartStyles = StyleSheet.create({
  // Screen layout
  chartScreenContent: {
    flexGrow: 1,
  },

  // Granularity tabs (Daily / Weekly / Monthly)
  granularityTabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderColor,
  },
  granularityTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: tokens.spacing._15,
  },
  granularityTabText: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
  },
  granularityTabTextActive: {
    fontFamily: tokens.fonts.medium,
    fontWeight: "700",
    color: tokens.colors.text_primary,
  },
  granularityTabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: tokens.colors.primary,
  },

  // Window summary header (total + range + pagers)
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: tokens.spacing._10,
    paddingVertical: tokens.spacing._20,
  },
  summaryPagerButton: {
    padding: tokens.spacing._10,
  },
  summaryTextBlock: {
    flex: 1,
    alignItems: "center",
  },
  summaryValueText: {
    fontSize: tokens.fontSize.xl,
    fontFamily: tokens.fonts.medium,
    fontWeight: "700",
    color: tokens.colors.text_primary_dark,
  },
  summaryRangeText: {
    marginTop: tokens.spacing._5,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_primary,
  },

  // Chart area
  chartContainer: {
    height: 320,
    paddingHorizontal: tokens.spacing._10,
  },
  chartEmptyStateContainer: {
    height: 320,
    justifyContent: "center",
    alignItems: "center",
  },
  chartEmptyStateText: {
    color: tokens.colors.text_secondary,
    fontSize: tokens.fontSize.md,
    textAlign: "center",
    paddingHorizontal: tokens.spacing._20,
  },

  // Footnotes (Pro Tip / Disclaimer)
  footnotesContainer: {
    paddingHorizontal: tokens.spacing._15,
    paddingTop: tokens.spacing._20,
    gap: tokens.spacing._15,
  },
  footnoteText: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
    lineHeight: 22,
  },
  footnoteLabel: {
    fontFamily: tokens.fonts.medium,
    fontWeight: "700",
    color: tokens.colors.text_primary,
  },

  // Header spacer (keeps the screen title centered)
  headerSpacer: {
    width: 24,
  },
});
