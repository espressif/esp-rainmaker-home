/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RefObject } from "react";
import { View, Text, StyleSheet } from "react-native";

import { tokens } from "@shared/theme/tokens";
import { WEB_PLATFORM_UNSUPPORTED_PREFIX } from "@shared/utils/constants";

export interface EmbeddedAppIframeProps {
  /** Unused on native — web remount token */
  reloadKey?: number;
  /** Unused on native — web iframe ref */
  iframeRef?: RefObject<HTMLIFrameElement | null>;
}

/**
 * Native stub for the web-only embed iframe.
 * @param _props - Accepted for API parity with the web implementation
 */
export function EmbeddedAppIframe(_props: EmbeddedAppIframeProps) {
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
