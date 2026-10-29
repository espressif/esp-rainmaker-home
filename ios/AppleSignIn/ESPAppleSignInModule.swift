/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation
import UIKit
import React
import AuthenticationServices

/**
 * ESPAppleSignInModule — shows the system Sign in with Apple sheet and hands the
 * selected Apple ID's identity token back to JS.
 *
 * Unlike Google, this needs no third-party SDK: Sign in with Apple ships in
 * Apple's own AuthenticationServices framework. It does require the
 * `com.apple.developer.applesignin` entitlement — in ios/APP/APP.entitlements,
 * the file CODE_SIGN_ENTITLEMENTS points at, NOT the unused ios/APP.entitlements
 * one directory above — and
 * the capability enabled on the App ID in the developer portal — without those
 * the controller fails immediately rather than presenting.
 *
 * This module's only job is returning the identity token; the exchange for
 * RainMaker tokens belongs to the Base SDK's `loginWithFederatedToken`, called
 * from JS (see ESPAppleSignInAdapter.ts).
 *
 * Rejection codes mirror the Google module's contract:
 *   APPLE_SIGN_IN_UNAVAILABLE — too old an OS, or no window to present from.
 *                               JS falls back to the hosted browser flow.
 *   APPLE_SIGN_IN_CANCELLED   — the user dismissed the sheet.
 *   APPLE_SIGN_IN_FAILED      — anything else.
 *
 * iOS only. Sign in with Apple on Android has no native equivalent, so that
 * platform keeps the hosted browser flow.
 */
@objc(ESPAppleSignInModule)
class ESPAppleSignInModule: NSObject, RCTBridgeModule {

  private static let errorUnavailable = "APPLE_SIGN_IN_UNAVAILABLE"
  private static let errorCancelled = "APPLE_SIGN_IN_CANCELLED"
  private static let errorFailed = "APPLE_SIGN_IN_FAILED"

  static func moduleName() -> String { "ESPAppleSignInModule" }

  // The sheet is presented on the key window, so setup must be on the main queue.
  @objc static func requiresMainQueueSetup() -> Bool { true }

  /// Retains the delegate for the lifetime of one authorization request;
  /// ASAuthorizationController holds its delegate weakly.
  private var pendingRequest: AppleAuthorizationRequest?

  // MARK: - JS entry points

  /**
   * Whether the native Sign in with Apple sheet can be attempted. JS calls this
   * to choose between the native flow and the hosted browser flow before
   * showing any loading state.
   *
   * Reports only what the platform can do. Whether the BACKEND accepts an Apple
   * identity token is a separate question, decided in JS — see
   * ESPAppleSignInAdapter.
   */
  @objc(isAvailable:rejecter:)
  func isAvailable(resolver resolve: @escaping RCTPromiseResolveBlock,
                   rejecter reject: @escaping RCTPromiseRejectBlock) {
    // ASAuthorizationAppleIDProvider needs iOS 13 and the app targets 15.1, so
    // the framework is always there, and it offers no availability probe of its
    // own — the type exposes only createRequest and getCredentialState(forUserID:),
    // and the latter answers "is THIS user's credential still valid", which needs
    // a prior sign-in and so cannot gate a first one.
    //
    // What can still be missing at runtime is a window to anchor the sheet to.
    // That is the one condition `signIn` rejects with APPLE_SIGN_IN_UNAVAILABLE,
    // so it is checked here too — letting JS pick the browser flow before
    // anything is presented rather than after a failed attempt.
    //
    // The entitlement and the App ID capability are the other two ways Apple
    // sign-in fails, and neither is observable from here: both surface only once
    // the request is made, which is why that path still rejects rather than
    // being pre-empted.
    //
    // Main queue because reading the active scene's windows is UIKit state and
    // React Native calls this on a background queue.
    DispatchQueue.main.async {
      resolve(ESPAppleSignInModule.presentationAnchor() != nil)
    }
  }

  /**
   * Presents the Sign in with Apple sheet. Resolves with the identity token and
   * the one-time profile fields Apple returns.
   *
   * `fullName` and `email` arrive ONLY on the very first authorization for this
   * app; every later sign-in returns nil for them. They are passed through so a
   * caller can forward them if the backend ever wants them — the identity token
   * is what authenticates.
   */
  @objc(signIn:rejecter:)
  func signIn(resolver resolve: @escaping RCTPromiseResolveBlock,
              rejecter reject: @escaping RCTPromiseRejectBlock) {

    DispatchQueue.main.async {
      guard let anchor = ESPAppleSignInModule.presentationAnchor() else {
        reject(ESPAppleSignInModule.errorUnavailable,
               "No window available to present the Sign in with Apple sheet", nil)
        return
      }

      let request = ASAuthorizationAppleIDProvider().createRequest()
      request.requestedScopes = [.fullName, .email]

      let handler = AppleAuthorizationRequest(anchor: anchor) { [weak self] result in
        // Release the retained delegate now the request has settled.
        self?.pendingRequest = nil

        switch result {
        case .success(let credential):
          guard let tokenData = credential.identityToken,
                let identityToken = String(data: tokenData, encoding: .utf8),
                !identityToken.isEmpty else {
            reject(ESPAppleSignInModule.errorFailed,
                   "Apple did not return an identity token", nil)
            return
          }

          // ─── TEMPORARY DEBUG (remove once Apple sign-in is verified) ───
          NSLog("[APPLE-SIGNIN-DEBUG] native: identity token received, length=%d", identityToken.count)
          NSLog("[APPLE-SIGNIN-DEBUG] native: user=%@", credential.user)
          // ───────────────────────────────────────────────────────────────

          var payload: [String: Any] = ["idToken": identityToken]
          if let codeData = credential.authorizationCode,
             let authorizationCode = String(data: codeData, encoding: .utf8) {
            payload["authorizationCode"] = authorizationCode
          }
          if let email = credential.email {
            payload["email"] = email
          }
          if let fullName = credential.fullName {
            let parts = [fullName.givenName, fullName.familyName].compactMap { $0 }
            if !parts.isEmpty {
              payload["fullName"] = parts.joined(separator: " ")
            }
          }
          resolve(payload)

        case .cancelled:
          reject(ESPAppleSignInModule.errorCancelled,
                 "Sign in with Apple was cancelled", nil)

        case .failure(let error):
          reject(ESPAppleSignInModule.errorFailed, error.localizedDescription, error)
        }
      }

      self.pendingRequest = handler

      let controller = ASAuthorizationController(authorizationRequests: [request])
      controller.delegate = handler
      controller.presentationContextProvider = handler
      controller.performRequests()
    }
  }

  // MARK: - Presentation

  /// Key window of the active scene, which the sheet is anchored to.
  private static func presentationAnchor() -> UIWindow? {
    let scene = UIApplication.shared.connectedScenes
      .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
    return scene?.windows.first(where: { $0.isKeyWindow }) ?? scene?.windows.first
  }
}

// MARK: - Authorization delegate

/**
 * One-shot delegate for a single ASAuthorizationController request.
 *
 * Split out of the @objc bridge class for two reasons: ASAuthorizationController
 * holds its delegate weakly (so something must retain it for the duration of the
 * request), and keeping the AuthenticationServices protocol conformances off the
 * bridge class avoids Objective-C header generation issues — the same split
 * ESPOauthModule uses for its presentation context provider.
 */
private class AppleAuthorizationRequest: NSObject,
                                         ASAuthorizationControllerDelegate,
                                         ASAuthorizationControllerPresentationContextProviding {

  enum Result {
    case success(ASAuthorizationAppleIDCredential)
    case cancelled
    case failure(Error)
  }

  private let anchor: UIWindow
  private var completion: ((Result) -> Void)?

  init(anchor: UIWindow, completion: @escaping (Result) -> Void) {
    self.anchor = anchor
    self.completion = completion
    super.init()
  }

  /// Settles the request exactly once — the delegate callbacks are mutually
  /// exclusive, but a promise must never be resolved twice.
  private func finish(_ result: Result) {
    completion?(result)
    completion = nil
  }

  func authorizationController(controller: ASAuthorizationController,
                               didCompleteWithAuthorization authorization: ASAuthorization) {
    guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
      finish(.failure(NSError(
        domain: "ESPAppleSignInModule",
        code: -1,
        userInfo: [NSLocalizedDescriptionKey: "Unexpected Apple credential type"]
      )))
      return
    }
    finish(.success(credential))
  }

  func authorizationController(controller: ASAuthorizationController,
                               didCompleteWithError error: Error) {
    let nsError = error as NSError
    if nsError.domain == ASAuthorizationError.errorDomain,
       nsError.code == ASAuthorizationError.canceled.rawValue {
      finish(.cancelled)
      return
    }
    finish(.failure(error))
  }

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    return anchor
  }
}
