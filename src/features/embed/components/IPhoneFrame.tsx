/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReactNode } from "react";
import { View, Text, StyleSheet } from "react-native";

import { tokens } from "@shared/theme/tokens";
import { WEB_PLATFORM_UNSUPPORTED_PREFIX } from "@shared/utils/constants";

export interface IPhoneFrameProps {
  /** Screen content rendered inside the device glass */
  children: ReactNode;
}

/**
 * Native stub for the web-only iPhone chassis embed shell.
 * `EmbedScreen` redirects to `/` on non-desktop-web viewports, so this stub
 * is never rendered in practice; it exists for parity with the web
 * implementation and safe compile on native.
 * @param _props - Accepted for API parity with the web implementation
 */
export function IPhoneFrame(_props: IPhoneFrameProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        {WEB_PLATFORM_UNSUPPORTED_PREFIX}: embed showcase
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.spacing._20,
  },
  text: {
    color: tokens.colors.gray,
    textAlign: "center",
  },
});
