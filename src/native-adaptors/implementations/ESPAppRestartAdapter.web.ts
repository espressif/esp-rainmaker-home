/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Web app-restart adaptor. Native `expo-react-native-restart` is unavailable in
 * the browser; a full page reload rebuilds module-level state from the entry.
 */
export const ESPAppRestartAdapter = {
  /**
   * Reloads the browser page so SDK singletons and bootstrap run again.
   * Prefer remounting via `AppRestartContext` in `_layout.web.tsx` when only
   * the React tree needs resetting; use this for a hard reload fallback.
   */
  async restartApp(): Promise<void> {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  },
};

export default ESPAppRestartAdapter;
