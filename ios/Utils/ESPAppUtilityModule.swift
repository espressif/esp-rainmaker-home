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
class ESPAppUtilityModule: NSObject, RCTBridgeModule, CBCentralManagerDelegate {
  
  private var bluetoothManager: CBCentralManager?
  private var bluetoothResolver: RCTPromiseResolveBlock?
  private var bluetoothRejecter: RCTPromiseRejectBlock?
  
  static func moduleName() -> String! {
    return "ESPAppUtilityModule"
  }
  
  static func requiresMainQueueSetup() -> Bool {
    return true
  }
  
  // MARK: - CBCentralManagerDelegate
  
  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    guard let resolver = bluetoothResolver else { return }
    
    switch central.state {
    case .poweredOn:
      resolver(true)
    case .poweredOff, .unauthorized, .unsupported, .resetting, .unknown:
      resolver(false)
    @unknown default:
      resolver(false)
    }
    
    // Clean up
    bluetoothResolver = nil
    bluetoothRejecter = nil
    bluetoothManager = nil
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
  
  /**
   * Checks if location services are enabled.
   * @param promise Promise to resolve with boolean result
   */
  @objc(isLocationServicesEnabled:rejecter:)
  func isLocationServicesEnabled(resolver resolve: @escaping RCTPromiseResolveBlock,
                                  rejecter reject: @escaping RCTPromiseRejectBlock) {
    let manager = CLLocationManager()
    let isEnabled = CLLocationManager.locationServicesEnabled()
    resolve(isEnabled)
  }
  
  /**
   * Checks if Bluetooth is enabled/powered on.
   * Uses delegate pattern to get accurate state when available.
   * @param promise Promise to resolve with boolean result
   */
  @objc(isBluetoothEnabled:rejecter:)
  func isBluetoothEnabled(resolver resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
    // Check authorization first
    let authorization = CBCentralManager.authorization
    if authorization != .allowedAlways {
      resolve(false)
      return
    }
    
    // Store resolver/rejecter for delegate callback
    bluetoothResolver = resolve
    bluetoothRejecter = reject
    
    // Create manager with delegate so state updates properly
    // The delegate method centralManagerDidUpdateState will be called
    // when the Bluetooth state is actually known
    bluetoothManager = CBCentralManager(delegate: self, queue: nil, options: nil)
    
    // If state is already known (not .unknown), resolve immediately
    if let manager = bluetoothManager, manager.state != .unknown {
      centralManagerDidUpdateState(manager)
    }
  }
  
  /**
   * Requests all required permissions.
   * On iOS, this is handled by the app's Info.plist and permission requests happen automatically.
   */
  @objc(requestAllPermissions)
  func requestAllPermissions() {
    // On iOS, permissions are requested automatically when needed
    // This method exists for API compatibility with Android
  }
}
 
