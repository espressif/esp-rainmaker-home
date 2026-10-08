/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { WEB_EMBED_MIN_VIEWPORT_WIDTH } from "@shared/utils/constants";
import { isWebAppEmbeddedInIframe } from "@shared/utils/isWebAppEmbeddedInIframe";

/**
 * Whether the desktop iPhone embed shell should be active for this viewport.
 * True only for host windows wider than {@link WEB_EMBED_MIN_VIEWPORT_WIDTH}
 * and never inside the embed iframe itself (so the phone glass stays single-web).
 * @param viewportWidth - Host window width in CSS pixels
 * @returns Whether to show `/embed` phone chrome
 */
export function shouldShowWebDesktopEmbedPhone(
  viewportWidth: number,
): boolean {
  if (viewportWidth <= WEB_EMBED_MIN_VIEWPORT_WIDTH) {
    return false;
  }
  if (isWebAppEmbeddedInIframe()) {
    return false;
  }
  return true;
}
