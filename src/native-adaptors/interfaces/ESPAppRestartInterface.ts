/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { NativeModules } from "react-native";

interface ESPAppRestartInterface {
  /**
   * Relaunches (Android) or exits (iOS) the OS process. Never resolves on
   * success — the current process is gone first.
   */
  restartApp(): Promise<void>;
}

const { ESPAppRestartModule } = NativeModules;

/**
 * Native process-restart module (Android and iOS), or `undefined` when the
 * binary does not include it.
 */
export default ESPAppRestartModule as ESPAppRestartInterface | undefined;
