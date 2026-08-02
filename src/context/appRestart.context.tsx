/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext } from "react";

export interface AppRestartContextValue {
  /**
   * Relaunches the app as a new OS process. Use when module-level state that
   * cannot be rebuilt in place has to be discarded (sign-out, a scanned config).
   */
  restartApp: () => void;
  /**
   * Rebuilds the SDK layer in place against the persisted runtime config and
   * remounts the provider tree — a deployment switch without the relaunch.
   * Rejects on failure so callers can fall back to {@link restartApp}.
   */
  reinitializeSdk: () => Promise<void>;
}

export const AppRestartContext = createContext<AppRestartContextValue>({
  restartApp: () => {},
  reinitializeSdk: async () => {},
});
