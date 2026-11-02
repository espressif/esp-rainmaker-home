/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet } from "react-native";

import { globalStyles } from "@shared/theme/globalStyleSheet";
import { tokens } from "@shared/theme/tokens";

/** Same base as CreateScene / CreateSchedule: flex column, padding, bg5. */
export const updateDeviceNameScreenWrapperStyle = globalStyles.container;

export const updateDeviceNameStyles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    width: "100%",
    alignItems: "stretch",
  },
  contentSingle: {
    alignItems: "center",
  },
  singleImageBlock: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: tokens.spacing._20,
  },
  singleDeviceImage: {
    width: 70,
    height: 70,
  },
  nameSection: {
    width: "100%",
    marginBottom: tokens.spacing._30,
  },
  nameSectionSingle: {
    alignItems: "stretch",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    minHeight: 48,
    paddingLeft: tokens.spacing._10,
    paddingRight: tokens.spacing._5,
    paddingVertical: tokens.spacing._5,
    marginBottom: tokens.spacing._10,
    backgroundColor: tokens.colors.white,
    borderWidth: 1,
    borderColor: tokens.colors.borderColor,
    borderRadius: tokens.radius.md,
  },
  inputRowLast: {
    marginBottom: 0,
  },
  rowDeviceImage: {
    width: 40,
    height: 40,
  },
  inputInRow: {
    flex: 1,
    minWidth: 0,
  },
  /** Row: name field flexes; trailing pencil hints that the field is editable. */
  nameInputRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  nameInputWrapper: {
    flex: 1,
    minWidth: 0,
  },
  nameEditIcon: {
    marginLeft: tokens.spacing._10,
    marginRight: tokens.spacing._10,
  },
  /** Trailing per-device action (identify), paired with the pencil. */
  nameRowAction: {
    marginRight: tokens.spacing._10,
  },
  continueButton: {
    width: "100%",
    minHeight: 48,
    justifyContent: "center",
  },
  /** Pinned footer: marginTop "auto" like SceneActionButtons + action padding. */
  footer: {
    marginTop: "auto",
    width: "100%",
    flexDirection: "column",
    alignItems: "stretch",
    paddingTop: tokens.spacing._10,
    paddingBottom: tokens.spacing._20,
  },
});

export const updateDeviceNameContinueButtonStyle = StyleSheet.flatten([
  globalStyles.btn,
  globalStyles.bgBlue,
  globalStyles.shadowElevationForLightTheme,
  updateDeviceNameStyles.continueButton,
]);

