// SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
// SPDX-License-Identifier: Apache-2.0

internal import EXUpdates
import Foundation

/// ObjC-callable bridge for expo-updates' Swift `AppController`.
///
/// expo-updates normally wires itself up through the Expo subscriber system
/// (via `ExpoUpdatesReactDelegateHandler`), but this project's AppDelegate
/// inherits from `RCTAppDelegate` rather than `ExpoAppDelegate`, so the
/// subscribers never fire. We initialize the singleton and kick off the
/// update pipeline manually from `AppDelegate.mm`.
///
/// `internal` matches the access level EXUpdates is imported at; `@objc`
/// still exposes the class to ObjC in the same target via the auto-generated
/// `APP-Swift.h`. The `AppControllerDelegate` conformance is intentionally
/// on a private nested type so the outer class's ObjC surface stays free of
/// EXUpdates symbols that the auto-generated header can't resolve.
@objc(ESPUpdatesBootstrap)
class ESPUpdatesBootstrap: NSObject {
  private static let readyProxy = ReadyProxy()

  /// Prepares `AppController.sharedInstance` without starting the update
  /// check. Must be called before `startAndWait` or `launchAssetUrl`; the
  /// singleton force-unwraps its internal state otherwise.
  @objc static func initializeWithoutStarting() {
    AppController.initializeWithoutStarting()
  }

  /// Starts the update pipeline and blocks the caller for up to
  /// `timeoutSeconds` until the controller has selected a launch asset.
  /// Without this wait, `AppDelegate.bundleURL` races the async launcher
  /// and reads a nil `launchAssetUrl`, so a pending OTA is silently
  /// discarded and the embedded bundle is loaded on every cold boot.
  @objc static func startAndWait(_ timeoutSeconds: TimeInterval) {
    AppController.sharedInstance.delegate = readyProxy
    AppController.sharedInstance.start()
    _ = readyProxy.wait(timeoutSeconds: timeoutSeconds)
  }

  /// URL of the currently-active launch asset (embedded on first boot,
  /// the downloaded OTA on subsequent boots). Nil until the controller's
  /// launcher completes, so callers must invoke `startAndWait` first.
  @objc static func launchAssetUrl() -> URL? {
    return AppController.sharedInstance.launchAssetUrl()
  }
}

/// Bridges `AppControllerDelegate` (from the `internal`-imported EXUpdates
/// module) into a semaphore the ObjC-facing `ESPUpdatesBootstrap` can wait
/// on, without leaking the delegate protocol into that class's public API.
private final class ReadyProxy: NSObject, AppControllerDelegate {
  private let semaphore = DispatchSemaphore(value: 0)

  func wait(timeoutSeconds: TimeInterval) -> DispatchTimeoutResult {
    return semaphore.wait(timeout: .now() + timeoutSeconds)
  }

  func appController(_ appController: AppControllerInterface, didStartWithSuccess success: Bool) {
    semaphore.signal()
  }
}
