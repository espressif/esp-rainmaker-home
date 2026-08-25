/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation
import UIKit
import React
import GoogleSignIn

/**
 * ESPGoogleSignInModule — shows Google's own account picker (through the
 * GoogleSignIn SDK) and hands the selected account's ID token back to JS.
 *
 * Returning that token is its whole job: the exchange for RainMaker tokens
 * belongs to the Base SDK, so no network call is made here.
 *
 * Both Info.plist client ids are needed, for different reasons. GIDClientID
 * identifies this app to Google; GIDServerClientID is the web client the token
 * is minted for — the audience the backend verifies. Omit the latter and an
 * otherwise successful sign-in is rejected by the backend.
 *
 * Rejection codes match the Android module. GOOGLE_SIGN_IN_UNAVAILABLE is the
 * one carrying behaviour: JS reads it as "use the hosted browser flow instead".
 */
@objc(ESPGoogleSignInModule)
class ESPGoogleSignInModule: NSObject, RCTBridgeModule {

  private static let errorUnavailable = "GOOGLE_SIGN_IN_UNAVAILABLE"
  private static let errorCancelled = "GOOGLE_SIGN_IN_CANCELLED"
  private static let errorFailed = "GOOGLE_SIGN_IN_FAILED"

  // Rejection messages, kept word for word identical to the Android module so a
  // code always reaches JS with the same text. The platform-specific cause goes
  // to the log instead, where it does not cross the bridge.
  private static let msgUnavailable = "Google sign-in is not available"
  private static let msgCancelled = "Google account selection was cancelled"

  static func moduleName() -> String { "ESPGoogleSignInModule" }

  // The account picker is presented on the key window, so setup must happen on
  // the main queue.
  @objc static func requiresMainQueueSetup() -> Bool { true }

  // MARK: - Configuration

  /// iOS OAuth client id for this app, or nil when the build is unconfigured.
  private static func iosClientID() -> String? {
    guard let value = Bundle.main.infoDictionary?["GIDClientID"] as? String,
          !value.isEmpty else {
      return nil
    }
    return value
  }

  /// Web OAuth client id whose audience the RainMaker backend verifies.
  private static func serverClientID() -> String? {
    guard let value = Bundle.main.infoDictionary?["GIDServerClientID"] as? String,
          !value.isEmpty else {
      return nil
    }
    return value
  }

  // MARK: - JS entry points

  /**
   * Whether the native account picker can be attempted on this build. JS calls
   * this to decide between the native flow and the hosted browser flow before
   * showing any loading state.
   */
  @objc(isAvailable:rejecter:)
  func isAvailable(resolver resolve: @escaping RCTPromiseResolveBlock,
                   rejecter reject: @escaping RCTPromiseRejectBlock) {
    // Both ids are required: the iOS client to run the flow, the web client so
    // the resulting token is one the backend will accept.
    resolve(ESPGoogleSignInModule.iosClientID() != nil
            && ESPGoogleSignInModule.serverClientID() != nil)
  }

  /**
   * Shows the Google account picker. Resolves with `{ idToken }` for the
   * account the user selects.
   */
  @objc(signIn:rejecter:)
  func signIn(resolver resolve: @escaping RCTPromiseResolveBlock,
              rejecter reject: @escaping RCTPromiseRejectBlock) {

    guard let clientID = ESPGoogleSignInModule.iosClientID() else {
      NSLog("GIDClientID is not configured for this build")
      reject(ESPGoogleSignInModule.errorUnavailable,
             ESPGoogleSignInModule.msgUnavailable, nil)
      return
    }
    guard let serverClientID = ESPGoogleSignInModule.serverClientID() else {
      NSLog("GIDServerClientID is not configured for this build")
      reject(ESPGoogleSignInModule.errorUnavailable,
             ESPGoogleSignInModule.msgUnavailable, nil)
      return
    }

    DispatchQueue.main.async {
      guard let presenter = ESPGoogleSignInModule.topViewController() else {
        NSLog("No view controller available to present the Google account picker")
        reject(ESPGoogleSignInModule.errorUnavailable,
               ESPGoogleSignInModule.msgUnavailable, nil)
        return
      }

      GIDSignIn.sharedInstance.configuration = GIDConfiguration(
        clientID: clientID,
        serverClientID: serverClientID
      )

      GIDSignIn.sharedInstance.signIn(withPresenting: presenter) { result, error in
        if let error = error as NSError? {
          if error.domain == kGIDSignInErrorDomain
              && error.code == GIDSignInError.canceled.rawValue {
            reject(ESPGoogleSignInModule.errorCancelled,
                   ESPGoogleSignInModule.msgCancelled, nil)
          } else {
            reject(ESPGoogleSignInModule.errorFailed,
                   error.localizedDescription, error)
          }
          return
        }

        guard let idToken = result?.user.idToken?.tokenString else {
          reject(ESPGoogleSignInModule.errorFailed,
                 "Google did not return an ID token for the selected account", nil)
          return
        }

        resolve(["idToken": idToken])
      }
    }
  }

  /**
   * Forgets the Google account this app signed in with, so the next sign-in
   * shows the account chooser instead of restoring the previous session.
   * Call on logout.
   *
   * Resolves with true and NEVER rejects — `signOut()` is a local state clear
   * with nothing to fail — so logout is never blocked by it. Mirrors the
   * Android module's `signOut`, which clears Credential Manager state.
   */
  @objc(signOut:rejecter:)
  func signOut(resolver resolve: @escaping RCTPromiseResolveBlock,
               rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      GIDSignIn.sharedInstance.signOut()
      resolve(true)
    }
  }

  // MARK: - URL callback

  /**
   * Hands a URL to the GoogleSignIn SDK, called by AppDelegate's
   * `application:openURL:options:`. Returns true only when the URL belongs to
   * an in-flight Google sign-in, so other schemes fall through untouched.
   *
   * Exposed to Objective-C so AppDelegate can route the callback through the
   * app's own generated Swift header instead of importing the GoogleSignIn
   * module into Objective-C++.
   */
  @objc(handleOpenURL:)
  static func handleOpenURL(_ url: URL) -> Bool {
    return GIDSignIn.sharedInstance.handle(url)
  }

  // MARK: - Presentation

  /// Topmost presented view controller of the active window, which the picker
  /// must be presented from (presenting on a controller that is already
  /// covered is a no-op the user never sees).
  private static func topViewController() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes
      .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
    let window = scene?.windows.first(where: { $0.isKeyWindow }) ?? scene?.windows.first

    var controller = window?.rootViewController
    while let presented = controller?.presentedViewController {
      controller = presented
    }
    return controller
  }
}
