/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  WEB_EMBED_FRAME_MAX_HEIGHT,
  WEB_EMBED_FRAME_VH_RATIO,
  WEB_EMBED_FRAME_VW_RATIO,
  WEB_EMBED_PHONE_BEZEL,
  WEB_EMBED_PHONE_HEIGHT,
  WEB_EMBED_PHONE_ISLAND_HEIGHT,
  WEB_EMBED_PHONE_ISLAND_WIDTH,
  WEB_EMBED_PHONE_RADIUS,
  WEB_EMBED_PHONE_SAFE_INSET_BOTTOM,
  WEB_EMBED_PHONE_SAFE_INSET_TOP,
  WEB_EMBED_PHONE_WIDTH,
} from "@shared/utils/constants";

/** Fixed logical iPhone metrics plus CSS scale to fit the host viewport */
export interface EmbedFrameSize {
  /** Fixed glass width (iframe layout viewport) */
  glassWidth: number;
  /** Fixed glass height (iframe layout viewport) */
  glassHeight: number;
  /** Fixed bezel thickness */
  bezel: number;
  /** Fixed outer chassis corner radius */
  radius: number;
  /** Fixed Dynamic Island width */
  islandWidth: number;
  /** Fixed Dynamic Island height */
  islandHeight: number;
  /** Fixed top safe inset under the island */
  safeInsetTop: number;
  /** Fixed bottom safe inset for the home indicator */
  safeInsetBottom: number;
  /** Full chassis width before CSS scale */
  chassisWidth: number;
  /** Full chassis height before CSS scale */
  chassisHeight: number;
  /**
   * Uniform CSS scale so the fixed phone fits in
   * `min(80vh, 700px)` × available width (never stretches the iframe viewport).
   */
  displayScale: number;
  /** On-screen width after scale (for outer layout box) */
  displayWidth: number;
  /** On-screen height after scale (for outer layout box) */
  displayHeight: number;
}

/**
 * Returns a standard 390×844 phone layout, CSS-scaled to fit the page.
 * The iframe always sees a normal mobile window; only the outer chrome shrinks.
 * @param viewportWidth - Host window width in CSS pixels
 * @param viewportHeight - Host window height in CSS pixels
 * @returns Fixed phone metrics and display scale
 */
export function getEmbedFrameSize(
  viewportWidth: number,
  viewportHeight: number,
): EmbedFrameSize {
  const glassWidth = WEB_EMBED_PHONE_WIDTH;
  const glassHeight = WEB_EMBED_PHONE_HEIGHT;
  const bezel = WEB_EMBED_PHONE_BEZEL;
  const chassisWidth = glassWidth + bezel * 2;
  const chassisHeight = glassHeight + bezel * 2;

  const maxDisplayHeight = Math.min(
    viewportHeight * WEB_EMBED_FRAME_VH_RATIO,
    WEB_EMBED_FRAME_MAX_HEIGHT,
  );
  const maxDisplayWidth = viewportWidth * WEB_EMBED_FRAME_VW_RATIO;

  const displayScale = Math.min(
    1,
    maxDisplayHeight / chassisHeight,
    maxDisplayWidth / chassisWidth,
  );

  return {
    glassWidth,
    glassHeight,
    bezel,
    radius: WEB_EMBED_PHONE_RADIUS,
    islandWidth: WEB_EMBED_PHONE_ISLAND_WIDTH,
    islandHeight: WEB_EMBED_PHONE_ISLAND_HEIGHT,
    safeInsetTop: WEB_EMBED_PHONE_SAFE_INSET_TOP,
    safeInsetBottom: WEB_EMBED_PHONE_SAFE_INSET_BOTTOM,
    chassisWidth,
    chassisHeight,
    displayScale,
    displayWidth: chassisWidth * displayScale,
    displayHeight: chassisHeight * displayScale,
  };
}
