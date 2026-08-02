/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { NativeModules } from "react-native";

interface ESPAppRestartInterface {
  /**
   * Relaunches the app as a new OS process. Never resolves on success — the
   * current process exits before the promise can settle.
   */
  restartApp(): Promise<void>;
}

const { ESPAppRestartModule } = NativeModules;

/**
 * Android-only bridge: the module is not registered on iOS, so this resolves
 * to `undefined` there. Callers must handle the absent case — see
 * `ESPAppRestartAdapter`, which falls back to an in-place runtime reload.
 */
export default ESPAppRestartModule as ESPAppRestartInterface | undefined;
