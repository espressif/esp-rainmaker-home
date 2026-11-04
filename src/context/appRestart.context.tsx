/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext } from "react";

export interface AppRestartContextValue {
  /**
   * Reloads the JS runtime without quitting the app, so module-level state
   * (style tokens, SDK singletons, bootstrap) is rebuilt. Restarts the process
   * instead if the reload throws.
   */
  restartApp: () => void;
  /**
   * Rebuilds the SDK layer in place against the persisted runtime config and
   * remounts the provider tree, without reloading JS.
   * Rejects on failure so callers can fall back to {@link restartApp}.
   */
  reinitializeSdk: () => Promise<void>;
}

export const AppRestartContext = createContext<AppRestartContextValue>({
  restartApp: () => {},
  reinitializeSdk: async () => {},
});
