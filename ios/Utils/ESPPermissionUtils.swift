/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation
import CoreBluetooth
import CoreLocation

/// Centralized manager for requesting Bluetooth and Location permissions.
/// Keeps all "asking for permission" logic out of React Native bridge classes.
@objc(ESPPermissionUtils)
@objcMembers
class ESPPermissionUtils: NSObject, CBCentralManagerDelegate, CLLocationManagerDelegate {
  static let shared = ESPPermissionUtils()

  private var centralManager: CBCentralManager?
  private let locationManager: CLLocationManager

  override init() {
    self.locationManager = CLLocationManager()
    super.init()
    self.locationManager.delegate = self
  }

  /// Objective-C friendly singleton accessor.
  /// - Returns: The shared `ESPPermissionUtils` instance.
  @objc class func sharedInstance() -> ESPPermissionUtils {
    return ESPPermissionUtils.shared
  }

  func requestBlePermission() {
    let authorization = CBCentralManager.authorization
    switch authorization {
    case .notDetermined:
      centralManager = CBCentralManager(delegate: self, queue: .main)
    case .allowedAlways, .denied, .restricted:
      break
    @unknown default:
      centralManager = CBCentralManager(delegate: self, queue: .main)
    }
  }

  func requestLocationPermission() {
    let authorizationStatus: CLAuthorizationStatus
    if #available(iOS 14, *) {
      authorizationStatus = locationManager.authorizationStatus
    } else {
      authorizationStatus = CLLocationManager.authorizationStatus()
    }

    switch authorizationStatus {
    case .notDetermined:
      locationManager.requestWhenInUseAuthorization()
    case .denied, .restricted, .authorizedWhenInUse, .authorizedAlways:
      break
    @unknown default:
      break
    }
  }

  func requestAllPermissions() {
    DispatchQueue.main.async { [weak self] in
      self?.requestBlePermission()
      self?.requestLocationPermission()
    }
  }

  // MARK: - CBCentralManagerDelegate
  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    // No-op: We only initialize to trigger the system prompt when needed.
  }

  // MARK: - CLLocationManagerDelegate
  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    // No-op: Permission outcomes are handled by the system UI; app can query as needed.
  }
}


