/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  View,
  StyleSheet,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";

import { EmbedStatusBar } from "@features/embed/components/EmbedStatusBar";
import { getEmbedFrameSize } from "@features/embed/utils/embedFrameSize";
import { tokens } from "@shared/theme/tokens";

/** Web-only extension: RN-web accepts the CSS `transformOrigin` shortcut. */
type WebViewStyle = ViewStyle & { transformOrigin?: string };

export interface IPhoneFrameProps {
  /** Screen content rendered inside the device glass */
  children: ReactNode;
}

/**
 * Standard iPhone chassis for `/embed`.
 * Glass/iframe stay fixed at 390×844 (normal mobile layout). The whole phone
 * is CSS-scaled to fit `min(80vh, 700px)`. Overflow is clipped to the chassis
 * so nothing paints outside the phone outline. Top inset shows host battery.
 * @param props - Frame props
 * @param props.children - App surface to show inside the glass
 */
export function IPhoneFrame({ children }: IPhoneFrameProps) {
  const { width: viewportWidth, height: viewportHeight } =
    useWindowDimensions();
  const size = useMemo(
    () => getEmbedFrameSize(viewportWidth, viewportHeight),
    [viewportWidth, viewportHeight],
  );

  const glassRadius = size.radius - size.bezel;

  return (
    <View
      style={[
        styles.displayBox,
        {
          width: size.displayWidth,
          height: size.displayHeight,
          borderRadius: size.radius * size.displayScale,
        },
      ]}
    >
      <View
        // Fixed 390×844 chassis; CSS scale fits the page without changing
        // the iframe's mobile layout viewport (avoids zoomed-in UI).
        style={[
          styles.chassis,
          {
            width: size.chassisWidth,
            height: size.chassisHeight,
            borderRadius: size.radius,
            padding: size.bezel,
            transform: [{ scale: size.displayScale }],
          },
          styles.scaleOrigin,
        ]}
        accessibilityLabel="iPhone frame"
      >
        <View
          style={[
            styles.island,
            {
              top: size.bezel + size.safeInsetTop * 0.18,
              left: (size.chassisWidth - size.islandWidth) / 2,
              width: size.islandWidth,
              height: size.islandHeight,
              borderRadius: size.islandHeight / 2,
            },
          ]}
        />
        <View
          style={[
            styles.glass,
            {
              width: size.glassWidth,
              height: size.glassHeight,
              borderRadius: glassRadius,
              paddingTop: size.safeInsetTop,
            },
          ]}
        >
          <EmbedStatusBar height={size.safeInsetTop} />
          {children}
        </View>
      </View>
    </View>
  );
}

const scaleOrigin: WebViewStyle = {
  transformOrigin: "top left",
};

const styles = StyleSheet.create({
  displayBox: {
    overflow: "hidden",
  },
  chassis: {
    backgroundColor: tokens.colors.black,
    overflow: "hidden",
  },
  /** Web: scale from top-left so the layout box matches the scaled footprint. */
  scaleOrigin,
  island: {
    position: "absolute",
    zIndex: 4,
    backgroundColor: tokens.colors.black,
  },
  glass: {
    overflow: "hidden",
    backgroundColor: tokens.colors.white,
  },
});
