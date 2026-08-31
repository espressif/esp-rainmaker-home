/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Platform, StyleSheet } from "react-native";

import { tokens } from "@shared/theme/tokens";
import { PLATFORM_WEB } from "@shared/utils/constants";

const isWeb = Platform.OS === PLATFORM_WEB;

/**
 * Input styles.
 * - Native: underline border on the text field itself.
 * - Web: full rounded border on the wrapper, taller row for accessibility
 *   target size, and inline horizontal padding.
 */
const inputStyles = StyleSheet.create({
  container: {
    width: "100%",
  },
  inputWrapper: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tokens.colors.white,
    borderRadius: tokens.radius.sm,
    ...(isWeb ? { minHeight: 44 } : null),
  },
  marginBottom: {
    marginBottom: tokens.spacing._15,
  },
  wrapperBorder: isWeb
    ? {
        borderWidth: 1,
        borderColor: tokens.colors.borderColor,
      }
    : {},
  wrapperErrorBorder: isWeb
    ? {
        borderColor: tokens.colors.red,
      }
    : {},
  inputBorder: isWeb
    ? {}
    : {
        borderBottomWidth: 1,
        borderColor: tokens.colors.borderColor,
      },
  inputErrorBorder: isWeb
    ? {}
    : {
        borderBottomWidth: 1,
        borderColor: tokens.colors.red,
      },
  input: {
    flex: 1,
    height: isWeb ? 44 : 40,
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.black,
    fontFamily: tokens.fonts.regular,
    ...(isWeb
      ? {
          paddingLeft: tokens.spacing._15,
          paddingRight: tokens.spacing._15,
        }
      : null),
  },
  paddingHorizontal: {
    paddingHorizontal: tokens.spacing._20,
  },
  paddingLeft: {
    paddingLeft: isWeb ? 44 : 30,
  },
  paddingRight: isWeb ? { paddingRight: 40 } : {},
  leftIcon: {
    position: "absolute",
    left: isWeb ? tokens.spacing._15 : 0,
    zIndex: 10,
    ...(isWeb ? null : { marginRight: tokens.spacing._10 }),
  },
  eyeIcon: {
    position: "absolute",
    right: isWeb ? tokens.spacing._10 : tokens.spacing._5,
    zIndex: 10,
  },
  disabled: {
    opacity: 0.4,
  },
  errorText: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.red,
    marginTop: tokens.spacing._5,
    fontFamily: tokens.fonts.regular,
  },
});

export default inputStyles;
