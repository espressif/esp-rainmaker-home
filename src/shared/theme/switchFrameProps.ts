/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Platform } from "react-native";
import { PLATFORM_WEB } from "@shared/utils/constants";
import { tokens } from "./tokens";

/** Native Tamagui Switch takes its border from props, not `style`; web keeps the default border for its thumb math. */
export const switchFrameProps =
  Platform.OS === PLATFORM_WEB
    ? {}
    : { borderColor: tokens.colors.bg1, borderWidth: 0 };
