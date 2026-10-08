/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet } from "react-native";
import { tokens } from "@shared/theme/tokens";

/**
 * Web-only styles for the provision QR paste / upload input step.
 */
export const scanQRWebStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tokens.colors.bg,
    padding: 0,
  },
  scroll: {
    flex: 1,
    backgroundColor: tokens.colors.bg,
  },
  scrollContent: {
    padding: tokens.spacing._15,
    paddingBottom: tokens.spacing._20,
    backgroundColor: tokens.colors.bg,
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
    backgroundColor: tokens.colors.white,
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
    flexDirection: "column",
    alignItems: "stretch",
    width: "100%",
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
    minHeight: tokens.spacing._40 + tokens.spacing._20,
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
  /** Outlined secondary actions — full width, equal length. */
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    minHeight: 48,
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
  /** Primary CTA — same width as secondary / footer actions. */
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    minHeight: 48,
    backgroundColor: tokens.colors.primary,
    paddingVertical: tokens.spacing._15,
    paddingHorizontal: tokens.spacing._20,
    borderRadius: tokens.radius.sm,
    marginTop: tokens.spacing._20,
  },
  primaryButtonText: {
    color: tokens.colors.white,
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
  },
  /** “I don’t have a QR code” — light fill, no border. */
  noQrButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    minHeight: 48,
    backgroundColor: tokens.colors.bg2,
    borderWidth: 0,
    paddingVertical: tokens.spacing._10,
    paddingHorizontal: tokens.spacing._15,
    borderRadius: tokens.radius.sm,
  },
  noQrButtonText: {
    color: tokens.colors.text_primary,
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
  },
  readyCard: {
    borderWidth: tokens.border.defaultWidth,
    borderColor: tokens.colors.borderColor,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing._20,
    marginBottom: tokens.spacing._15,
  },
  readyTitle: {
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    marginBottom: tokens.spacing._5,
  },
  readyDeviceName: {
    fontSize: tokens.fontSize.lg,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.primary,
    marginBottom: tokens.spacing._10,
  },
  readyHint: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
    marginBottom: tokens.spacing._20,
  },
  footerRow: {
    paddingHorizontal: tokens.spacing._15,
    paddingBottom: tokens.spacing._20,
    paddingTop: 0,
    width: "100%",
    alignItems: "stretch",
  },
});
