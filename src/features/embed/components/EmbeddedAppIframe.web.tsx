/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { createElement, useMemo, type RefObject } from "react";
import { StyleSheet, View } from "react-native";

import { getEmbeddedAppSrcPath } from "@features/embed/utils";
import {
  WEB_EMBED_APP_SRC_PATH,
  WEB_EMBED_IFRAME_ALLOW,
  WEB_EMBED_PHONE_WIDTH,
} from "@shared/utils/constants";
import { styleQuery } from "@shared/runtimeStyle/config";

export interface EmbeddedAppIframeProps {
  /** Increment to remount the iframe (hard refresh to app root) */
  reloadKey?: number;
  /** Ref to the underlying DOM iframe for history.back() */
  iframeRef?: RefObject<HTMLIFrameElement | null>;
}

/**
 * Resolves the absolute same-origin URL for the full app (never `/embed`).
 * Preserves versioned CDN prefixes and forwards the host `brand` param (or
 * storage-derived {@link styleQuery}) so the embedded app matches the shell theme.
 * @returns Absolute URL pointing at the app root under the current deploy prefix
 */
function getEmbeddedAppSrc(): string {
  if (typeof window === "undefined") {
    return `${WEB_EMBED_APP_SRC_PATH}${styleQuery}`;
  }
  return `${window.location.origin}${getEmbeddedAppSrcPath(window.location.pathname)}${styleQuery}`;
}

/**
 * Same-origin iframe locked to a standard mobile width (390px).
 * @param props - Reload key and optional iframe ref
 * @param props.reloadKey - Remount token for refresh
 * @param props.iframeRef - DOM ref for back navigation
 */
export function EmbeddedAppIframe({
  reloadKey = 0,
  iframeRef,
}: EmbeddedAppIframeProps) {
  const src = useMemo(() => getEmbeddedAppSrc(), [reloadKey]);


  const iframe = createElement("iframe", {
    key: reloadKey,
    ref: iframeRef,
    src,
    title: "ESP RainMaker",
    allow: WEB_EMBED_IFRAME_ALLOW,
    allowFullScreen: true,
    width: WEB_EMBED_PHONE_WIDTH,
    style: {
      width: WEB_EMBED_PHONE_WIDTH,
      height: "100%",
      border: "none",
      display: "block",
      overflow: "hidden",
    },
  });

  return <View style={styles.container}>{iframe}</View>;
}

const styles = StyleSheet.create({
  container: {
    width: WEB_EMBED_PHONE_WIDTH,
    flex: 1,
    overflow: "hidden",
  },
});
