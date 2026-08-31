/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet } from "react-native";
import { tokens } from "@shared/theme/tokens";

/**
 * Web-only styles for the config paste / upload input step.
 */
export const configScanWebStyles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: tokens.spacing._15,
    paddingBottom: tokens.spacing._40,
  },
  hint: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
    marginBottom: tokens.spacing._20,
  },
  dropZone: {
    borderWidth: tokens.border.defaultWidth,
    borderStyle: "dashed",
    borderColor: tokens.colors.borderColor,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.bg5,
    paddingVertical: tokens.spacing._30,
    paddingHorizontal: tokens.spacing._20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: tokens.spacing._15,
  },
  dropZoneActive: {
    borderColor: tokens.colors.primary,
    backgroundColor: tokens.colors.bg1,
  },
  dropZoneTitle: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    textAlign: "center",
    marginTop: tokens.spacing._10,
  },
  dropZoneSubtitle: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
    textAlign: "center",
    marginTop: tokens.spacing._5,
  },
  dropZoneActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: tokens.spacing._10,
    marginTop: tokens.spacing._20,
  },
  fileName: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
    textAlign: "center",
    marginTop: tokens.spacing._10,
  },
  fieldLabel: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_secondary,
    marginBottom: tokens.spacing._5,
    marginTop: tokens.spacing._10,
  },
  textArea: {
    minHeight: tokens.spacing._40 + tokens.spacing._40 + tokens.spacing._20,
    borderWidth: tokens.border.defaultWidth,
    borderColor: tokens.colors.borderColor,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing._15,
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_primary,
    textAlignVertical: "top",
  },
  localError: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.red,
    marginTop: tokens.spacing._10,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._5,
    backgroundColor: tokens.colors.white,
    borderWidth: tokens.border.defaultWidth,
    borderColor: tokens.colors.primary,
    paddingVertical: tokens.spacing._10,
    paddingHorizontal: tokens.spacing._15,
    borderRadius: tokens.radius.sm,
  },
  actionButtonText: {
    color: tokens.colors.primary,
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
  },
});
