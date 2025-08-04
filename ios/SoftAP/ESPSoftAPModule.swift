/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation
import UIKit
import SystemConfiguration.CaptiveNetwork

/**
 * ESPSoftAPModule provides SoftAP connectivity detection and WiFi settings navigation.
 * This module detects if the iOS device is connected to an ESP device's SoftAP network
 * and handles the provisioning flow similar to BLE connect.
 */
@objc(ESPSoftAPModule)
class ESPSoftAPModule: NSObject, RCTBridgeModule {
  
  static func moduleName() -> String! {
    return "ESPSoftAPModule"
  }
  
  static func requiresMainQueueSetup() -> Bool {
    return true
  }
  
  /**
   * Opens the app's settings page on iOS using public API.
   * This will open the Settings app to the specific app's settings page where users
   * can navigate to WiFi settings if needed.
   * @param resolve Promise to resolve with boolean result indicating success
   * @param reject Promise to reject in case of error
   */
  @objc(openWifiSettings:rejecter:)
  func openWifiSettings(resolver resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
    
    DispatchQueue.main.async {
      // Use public API to open app settings
      if let appSettingsUrl = URL(string: UIApplication.openSettingsURLString) {
        UIApplication.shared.open(appSettingsUrl, options: [:]) { success in
          resolve(success)
        }
      } else {
        resolve(false)
      }
    }
  }
  
  /**
   * Checks if device is connected to SoftAP and returns device name.
   * This checks for SoftAP connectivity by testing ESP protocol communication.
   * @param resolve Promise to resolve with device name if connected, null otherwise
   * @param reject Promise to reject in case of error
   */
    @objc(checkSoftAPConnection:rejecter:)
  func checkSoftAPConnection(resolver resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
    
    // Get current WiFi SSID
    guard let currentSSID = getCurrentSSID() else {
      resolve(nil)
      return
    }
    
    // Test if device responds to ESP protocol
    getDeviceVersionInfo { capabilities in
      if let caps = capabilities {
        // Return both device name and capabilities
        let result: [String: Any] = [
          "deviceName": currentSSID,
          "capabilities": caps
        ]
        resolve(result)
      } else {
        resolve(nil)
      }
    }
  }
  
  /**
   * Gets the current WiFi SSID.
   * @param resolve Promise to resolve with current SSID or null
   * @param reject Promise to reject in case of error
   */
  @objc(getCurrentWifiSSID:rejecter:)
  func getCurrentWifiSSID(resolver resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
    
    let ssid = getCurrentSSID()
    resolve(ssid)
  }
  
  // MARK: - Private Helper Methods
  
  /**
   * Gets the current WiFi SSID using CaptiveNetwork APIs
   */
  private func getCurrentSSID() -> String? {
    if let interfaces = CNCopySupportedInterfaces() as NSArray? {
      for interface in interfaces {
        if let interfaceInfo = CNCopyCurrentNetworkInfo(interface as! CFString) as NSDictionary? {
          if let currentSSID = interfaceInfo[kCNNetworkInfoKeySSID as String] as? String {
            return currentSSID
          }
        }
      }
    }
    return nil
  }
  
  /**
   * Gets device version info by sending HTTP request to the device
   */
  private func getDeviceVersionInfo(completion: @escaping ([String]?) -> Void) {
    guard let baseUrl = getCurrentSSID() else {
      completion(nil)
      return
    }
    
    let urlString = "http://192.168.4.1/proto-ver"
    guard let url = URL(string: urlString) else {
      completion(nil)
      return
    }
    
    var request = URLRequest(url: url)
    request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-type")
    request.setValue("text/plain", forHTTPHeaderField: "Accept")
    request.httpMethod = "POST"
    request.httpBody = Data("ESP".utf8)
    request.timeoutInterval = 2.0
    
    let task = URLSession.shared.dataTask(with: request) { data, response, error in
      guard let data = data, error == nil else {
        completion(nil)
        return
      }
      
      do {
        if let result = try JSONSerialization.jsonObject(with: data, options: .mutableContainers) as? NSDictionary {
          if let prov = result["prov"] as? NSDictionary,
             let capabilities = prov["cap"] as? [String] {
            completion(capabilities)
            return
          }
        }
      } catch {
        print("Error parsing device version info: \(error)")
      }
      
      completion(nil)
    }
    
    task.resume()
  }
  


}
