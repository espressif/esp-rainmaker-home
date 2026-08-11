/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet } from "react-native";
import { tokens } from "@shared/theme/tokens";

export const styles = StyleSheet.create({
  editButton: {
    color: tokens.colors.primary,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
  },
});
