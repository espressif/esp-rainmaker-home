/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation
import React

/**
 * Exits the app process. JS calls this only when reloading the JS runtime in
 * place fails. iOS has no public API to relaunch an app, so the user lands on
 * the home screen and reopens it.
 */
@objc(ESPAppRestartModule)
class ESPAppRestartModule: NSObject, RCTBridgeModule {

  static func moduleName() -> String! {
    return "ESPAppRestartModule"
  }

  static func requiresMainQueueSetup() -> Bool {
    return true
  }

  /**
   * Exits the process after a short delay on the main queue. The promise never
   * settles; the process is gone first.
   */
  @objc(restartApp:rejecter:)
  func restartApp(
    resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      // Short delay lets pending UI work finish before the exit.
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
        exit(0)
      }
    }
  }
}
