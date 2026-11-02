/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet } from "react-native";

import { tokens } from "@shared/theme/tokens";

/** Shared by identify and the system operations so the card reads as one set. */
export const deviceOperationsStyles = StyleSheet.create({
  actionButton: {
    paddingVertical: tokens.spacing._10,
    paddingHorizontal: tokens.spacing._15,
    borderRadius: tokens.radius.md,
  },
  actionContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacing._10,
  },
  actionLabel: {
    color: tokens.colors.white,
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
  },
});
