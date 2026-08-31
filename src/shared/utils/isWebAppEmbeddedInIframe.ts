/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Returns true when the web app is running inside a cross-frame embed
 * (e.g. the `/embed` iPhone frame iframe). Used by
 * `shouldShowWebDesktopEmbedPhone` to stop `/embed` from nesting inside its
 * own iframe — the outer host renders the phone chrome, the inner instance
 * skips it.
 * @returns Whether `window` is nested in a parent frame
 */
export function isWebAppEmbeddedInIframe(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin parent can throw on `window.top` access in some browsers.
    return true;
  }
}
