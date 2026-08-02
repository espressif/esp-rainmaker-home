/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { restart as reloadJsRuntime } from "expo-react-native-restart";
import ESPAppRestartModule from "../interfaces/ESPAppRestartInterface";

export const ESPAppRestartAdapter = {
  /**
   * Restarts the app so module-level state (SDK singletons, the one-time
   * `@src/bootstrap` setup) is rebuilt from the entry point.
   *
   * Prefers a full process relaunch. An in-place JS runtime reload leaves
   * react-native-skia's cached JSI `PropNameID`s pointing at the destroyed
   * Hermes runtime, and the next Skia property read then segfaults the JS
   * thread. The in-place reload is used only as a fallback where the native
   * module is unavailable (iOS), preserving the previous behaviour there.
   */
  async restartApp(): Promise<void> {
    if (ESPAppRestartModule) {
      try {
        await ESPAppRestartModule.restartApp();
        return;
      } catch (error) {
        console.error(
          "ESPAppRestartAdapter: Native process restart failed, falling back to runtime reload:",
          error
        );
      }
    }

    reloadJsRuntime();
  },
};

export default ESPAppRestartAdapter;
