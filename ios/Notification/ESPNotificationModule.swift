/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation
import React

@objc(ESPNotificationModule)
public class ESPNotificationModule: RCTEventEmitter {
  
  private var deviceToken: String?
  private let deviceTokenKey = "com.espressif.novahome.devicetoken"
  private var sendEvent = false
  private let eventKey = "ESPNotificationModule"
  
  // Singleton instance - made non-optional with lazy initialization
  @objc public static let shared = ESPNotificationModule()
  
  private override init() {
    super.init()
  }
  
  override public static func moduleName() -> String {
    return "ESPNotificationModule"
  }
  
  public override static func requiresMainQueueSetup() -> Bool {
    return true
  }
  
  // List of supported events
  public override func supportedEvents() -> [String]! {
    return [self.eventKey]
  }
  
  // Method to set the device token
  @objc(setDeviceToken:)
  func setDeviceToken(_ token: String) {
    UserDefaults.standard.setValue(token, forKey: deviceTokenKey)
  }
  
  /// Retrieves the device token from UserDefaults.
  ///
  /// - Parameters:
  ///   - resolve: A promise resolve block that is called with the device token if it exists.
  ///   - reject: A promise reject block that is called if the device token is not found.
  @objc(getDeviceToken:reject:)
  func getDeviceToken(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    // Check if the device token is stored in UserDefaults
    if let token = UserDefaults.standard.value(forKey: deviceTokenKey) {
      // Resolve the promise with the token if it exists
      resolve(token)
    } else {
      // Reject the promise if the token is not found
      reject("error", "Device token not set", nil)
    }
  }
  
  /// Retrieves the notification platform identifier.
  ///
  /// - Parameters:
  ///   - resolve: A promise resolve block that is called with the notification platform identifier.
  ///   - reject: A promise reject block that is called in case of any errors.
  @objc(getNotificationPlatform:reject:)
  func getNotificationPlatform(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    // Resolving the promise with a fixed notification platform identifier for APNS sandbox demo
    resolve("APNS_NOVA")
  }
  
  /// Add the notification listener.
  @objc(addNotificationListener)
  func addNotificationListener() {
    // Enable sending of events related to push notifications
    self.sendEvent = true
  }
  
  /// Removes the notification listener.
  @objc(removeNotificationListener)
  func removeNotificationListener() {
    // Disable sending of events related to push notifications
    self.sendEvent = false
  }
  
  
  // Method to handle silent notifications
  @objc(handleSilentNotification:)
  func handleSilentNotification(_ userInfo: [String: Any]) {
    // Handle silent notification logic here
    if sendEvent {
      sendEvent(withName: self.eventKey, body: userInfo)
    }
  }
  
  // Method to handle push notifications
  @objc(handlePushNotification:)
  func handlePushNotification(_ userInfo: [String: Any]) {
    // Handle push notification logic here
    if sendEvent {
      sendEvent(withName: self.eventKey, body: userInfo)
    }
  }
}
