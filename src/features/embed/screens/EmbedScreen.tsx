/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, useWindowDimensions } from "react-native";
import { Redirect } from "expo-router";

import {
  EmbeddedAppIframe,
  EmbedFrameControls,
  IPhoneFrame,
} from "@features/embed/components";
import { usePreventHostFileDrop } from "@features/embed/hooks";
import { shouldShowWebDesktopEmbedPhone } from "@features/embed/utils/shouldShowWebDesktopEmbedPhone";
import { tokens } from "@shared/theme/tokens";

/**
 * Web `/embed` screen: full RainMaker app inside an iPhone frame.
 * Live only when the host viewport is wider than 480px; otherwise redirects
 * to `/` for a normal single mobile web layout.
 * Outside controls support iframe history back and hard refresh to `/`.
 */
export function EmbedScreen() {
  const { width } = useWindowDimensions();
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  usePreventHostFileDrop(iframeRef);

  /**
   * Steps back one entry in the embedded app history when possible.
   * No-op when the iframe is at its first entry — otherwise `.back()`
   * would navigate outside RainMaker's `/web/.../version/` path.
   */
  const handleBack = useCallback(() => {
    try {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow || iframeWindow.history.length <= 1) {
        return;
      }
      iframeWindow.history.back();
    } catch {
      // Cross-origin or missing contentWindow — ignore.
    }
  }, []);

  /** Remounts the iframe so the embedded app reloads from the root URL. */
  const handleRefresh = useCallback(() => {
    setReloadKey((current) => current + 1);
  }, []);

  if (!shouldShowWebDesktopEmbedPhone(width)) {
    return <Redirect href="/" />;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      style={styles.scroll}
    >
      <View style={styles.stage}>
        <EmbedFrameControls onBack={handleBack} onRefresh={handleRefresh} />
        <IPhoneFrame>
          <EmbeddedAppIframe reloadKey={reloadKey} iframeRef={iframeRef} />
        </IPhoneFrame>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: tokens.colors.bg5,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: tokens.spacing._15,
    paddingHorizontal: 0,
  },
  stage: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
