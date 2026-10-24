/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { restart as reloadJsRuntime } from "expo-react-native-restart";
import ESPAppRestartModule from "../interfaces/ESPAppRestartInterface";

/**
 * Restarts the app by reloading the JS runtime while the native process keeps
 * running, with a native process restart as the fallback.
 */
export const ESPAppRestartAdapter = {
  /**
   * Reloads the JS runtime so module-level state (SDK singletons, style tokens,
   * the one-time `@src/bootstrap` setup) is rebuilt from the entry point. If the
   * reload throws, restarts the process through the native module instead.
   */
  async restartApp(): Promise<void> {
    try {
      reloadJsRuntime();
      return;
    } catch (error) {
      console.error(
        "ESPAppRestartAdapter: Soft JS reload failed, falling back to process restart:",
        error,
      );
    }

    if (ESPAppRestartModule) {
      try {
        await ESPAppRestartModule.restartApp();
        return;
      } catch (error) {
        console.error(
          "ESPAppRestartAdapter: Native process restart also failed:",
          error,
        );
        throw error;
      }
    }
  },
};

export default ESPAppRestartAdapter;
