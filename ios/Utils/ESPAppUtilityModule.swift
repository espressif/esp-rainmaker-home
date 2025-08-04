/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation
import React
import CoreBluetooth
import CoreLocation



/**
 * ESPAppUtilityModule provides permission status checks for React Native applications.
 * Requesting permissions is handled by `ESPPermissionUtils` to keep this bridge thin.
 */
@objc(ESPAppUtilityModule)
class ESPAppUtilityModule: NSObject, RCTBridgeModule {
  
  static func moduleName() -> String! {
    return "ESPAppUtilityModule"
  }
  
  static func requiresMainQueueSetup() -> Bool {
    return true
  }
  
  /**
   * Checks if BLE permission is granted.
   * @param promise Promise to resolve with boolean result
   */
  @objc(isBlePermissionGranted:rejecter:)
  func isBlePermissionGranted(resolver resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
    let authorization = CBCentralManager.authorization
    let isGranted = authorization == .allowedAlways
    resolve(isGranted)
  }
  
  /**
   * Checks if location permission is granted.
   * @param promise Promise to resolve with boolean result
   */
  @objc(isLocationPermissionGranted:rejecter:)
  func isLocationPermissionGranted(resolver resolve: @escaping RCTPromiseResolveBlock,
                                   rejecter reject: @escaping RCTPromiseRejectBlock) {
    
    let manager = CLLocationManager()
    
    switch manager.authorizationStatus {
    case .restricted, .denied:
      resolve(false)
    case .authorizedWhenInUse, .authorizedAlways:
      resolve(true)
    default:
      resolve(false)
    }
  }
}
 
