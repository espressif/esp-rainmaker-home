/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation
import UIKit
import React

/**
 * ESPWeChatModule — bridge between the React Native JS layer and the native
 * WeChat SDK (CN region only).
 *
 * JS calls `initiateWeChatLogin`; this module sends the WeChat auth request.
 * `AppDelegate` (the `WXApiDelegate`) forwards the auth response to
 * `handleAuthResponse`, which resolves the pending JS promise with `{ code }` —
 * the raw WeChat authorization code. The RainMaker Base SDK then exchanges the
 * code for tokens on the JS side (`loginWithOauthCode`).
 *
 * The WeChat App ID / Universal Link are registered by `AppDelegate` at launch
 * (read from Info.plist: `WeChatAppID` / `WeChatUniversalLink`).
 */
@objc(ESPWeChatModule)
class ESPWeChatModule: NSObject, RCTBridgeModule {

  @objc static var shared: ESPWeChatModule?

  private var pendingResolve: RCTPromiseResolveBlock?
  private var pendingReject: RCTPromiseRejectBlock?

  static func moduleName() -> String { "ESPWeChatModule" }

  @objc static func requiresMainQueueSetup() -> Bool { false }

  override init() {
    super.init()
    ESPWeChatModule.shared = self
  }

  // MARK: - JS entry point

  /// Sends the WeChat auth request and later resolves with `{ code }`. App ID
  /// comes from Info.plist (registered at launch by AppDelegate). The
  /// `tokenUrl` / `clientId` / `redirectUri` parameters are unused — the Base
  /// SDK performs the token exchange on the JS side — but are kept so the
  /// bridge method signature stays stable across platforms.
  @objc(initiateWeChatLogin:clientId:redirectUri:resolver:rejecter:)
  func initiateWeChatLogin(_ tokenUrl: String,
                           clientId: String,
                           redirectUri: String,
                           resolver resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {

    let appId = Bundle.main.infoDictionary?["WeChatAppID"] as? String ?? ""
    if appId.isEmpty {
      reject("WECHAT_CONFIG_ERROR", "WeChatAppID not found in Info.plist", nil)
      return
    }

    pendingResolve = resolve
    pendingReject = reject

    DispatchQueue.main.async { [weak self] in
      guard WXApi.isWXAppInstalled() else {
        self?.finishReject("WECHAT_NOT_INSTALLED", "WeChat is not installed on this device")
        return
      }

      let req = SendAuthReq()
      req.scope = "snsapi_userinfo"
      req.state = "esp_rainmaker_wechat_login"

      guard let delegate = UIApplication.shared.delegate as? WXApiDelegate,
            let topVC = ESPWeChatModule.topViewController() else {
        self?.finishReject("WECHAT_AUTH_FAILED", "No view controller available for WeChat auth")
        return
      }

      WXApi.sendAuthReq(req, viewController: topVC, delegate: delegate) { success in
        if !success {
          self?.finishReject("WECHAT_AUTH_FAILED", "Failed to send WeChat auth request")
        }
      }
    }
  }

  // MARK: - Auth response (forwarded by AppDelegate)

  @objc func handleAuthResponse(code: String?, errCode: Int32, errStr: String?) {
    guard pendingResolve != nil, pendingReject != nil else { return }

    switch errCode {
    case 0:
      if let authCode = code {
        finishResolve(["code": authCode])
      } else {
        finishReject("WECHAT_AUTH_FAILED", "Auth succeeded but no code received")
      }
    case -2:
      finishReject("WECHAT_CANCELLED", "WeChat login was cancelled by user")
    case -4:
      finishReject("WECHAT_AUTH_DENIED", "WeChat login was denied by user")
    default:
      finishReject("WECHAT_AUTH_FAILED", "errCode=\(errCode), errStr=\(errStr ?? "unknown")")
    }
  }

  // MARK: - Helpers

  /// Resolves the front-most view controller (used by the WeChat SDK as the
  /// presenter for the not-installed QR fallback).
  private static func topViewController() -> UIViewController? {
    let keyWindow = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }

    var top = keyWindow?.rootViewController
    while let presented = top?.presentedViewController {
      top = presented
    }
    return top
  }

  // MARK: - Promise helpers (clear pending state atomically)

  private func finishResolve(_ value: Any) {
    let resolve = pendingResolve
    pendingResolve = nil
    pendingReject = nil
    resolve?(value)
  }

  private func finishReject(_ code: String, _ message: String) {
    let reject = pendingReject
    pendingResolve = nil
    pendingReject = nil
    reject?(code, message, nil)
  }
}
