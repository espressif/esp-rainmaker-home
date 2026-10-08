/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, type RefObject } from "react";

import {
  DATA_TRANSFER_DROP_EFFECT_COPY,
  DOM_DRAG_DROP_LISTENER_OPTIONS,
  DOM_EVENT_DRAG_OVER,
  DOM_EVENT_DROP,
  WEB_EMBED_MESSAGE_FILE_DROP,
} from "@shared/utils/constants";

/**
 * Stops the host `/embed` page from opening a dropped file in a new tab, and
 * forwards the file into the phone iframe (config scan, etc.).
 * @param iframeRef - Ref to the embedded app iframe
 */
export function usePreventHostFileDrop(
  iframeRef: RefObject<HTMLIFrameElement | null>,
): void {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    /**
     * Blocks the browser default (navigate / new tab) and shows a copy cursor.
     * @param event - Host-window dragover
     */
    const preventNavigation = (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = DATA_TRANSFER_DROP_EFFECT_COPY;
      }
    };

    /**
     * Forwards a dropped file into the iframe instead of opening it.
     * @param event - Host-window drop
     */
    const handleHostDrop = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const file = event.dataTransfer?.files?.[0];
      const frameWindow = iframeRef.current?.contentWindow;
      if (!file || !frameWindow) {
        return;
      }
      frameWindow.postMessage(
        { type: WEB_EMBED_MESSAGE_FILE_DROP, file },
        window.location.origin,
      );
    };

    window.addEventListener(
      DOM_EVENT_DRAG_OVER,
      preventNavigation,
      DOM_DRAG_DROP_LISTENER_OPTIONS,
    );
    window.addEventListener(
      DOM_EVENT_DROP,
      handleHostDrop,
      DOM_DRAG_DROP_LISTENER_OPTIONS,
    );

    return () => {
      window.removeEventListener(
        DOM_EVENT_DRAG_OVER,
        preventNavigation,
        DOM_DRAG_DROP_LISTENER_OPTIONS,
      );
      window.removeEventListener(
        DOM_EVENT_DROP,
        handleHostDrop,
        DOM_DRAG_DROP_LISTENER_OPTIONS,
      );
    };
  }, [iframeRef]);
}
