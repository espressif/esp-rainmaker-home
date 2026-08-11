/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet } from "react-native";
import { tokens } from "@shared/theme/tokens";

export const createAutomationStyles = StyleSheet.create({
  section: {
    marginBottom: tokens.spacing._15,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: tokens.spacing._10,
  },
  sectionLabel: {
    fontSize: tokens.fontSize.sm,
    fontWeight: "500",
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    paddingLeft: tokens.spacing._5,
  },
  contentWrapper: {
    backgroundColor: tokens.colors.white,
    borderWidth: tokens.border.defaultWidth,
    borderColor: tokens.colors.borderColor,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: tokens.spacing._10,
  },
  input: {
    flex: 1,
    paddingRight: tokens.spacing._40,
  },
  editIcon: {
    top: tokens.spacing._10,
    position: "absolute",
    right: 0,
  },
  toggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.md,
    borderWidth: tokens.border.defaultWidth,
    borderColor: tokens.colors.borderColor,
    paddingHorizontal: tokens.spacing._15,
    paddingVertical: tokens.spacing._10,
  },
  toggleInfo: {
    flex: 1,
    marginRight: tokens.spacing._10,
  },
  toggleLabel: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    marginBottom: tokens.spacing._5,
  },
  toggleDescription: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.text_secondary,
  },
  addButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonContainer: {
    marginTop: "auto",
    flexDirection: "column",
    alignItems: "center",
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyStateIconContainer: {
    backgroundColor: tokens.colors.white,
    borderRadius: 48,
    padding: 20,
    marginBottom: 24,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing._10,
  },
  errorBorder: {
    borderColor: tokens.colors.red,
    borderWidth: tokens.border.defaultWidth,
  },
  errorContainer: {
    paddingTop: tokens.spacing._5,
    paddingBottom: tokens.spacing._10,
  },
  errorText: {
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fonts.regular,
    color: tokens.colors.red,
  },
  eventSummaryContainer: {
    gap: tokens.spacing._10,
  },
  actionsSection: {
    flex: 1,
    marginBottom: 0,
  },
  actionScrollView: {
    flex: 1,
    maxHeight: "80%",
  },
  actionScrollContent: {
    paddingBottom: tokens.spacing._20,
  },
  actionSummaryContainer: {
    gap: tokens.spacing._10,
  },
});
