/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation
import React
import ESPProvision

@objc(ESPLocalControlModule)
class ESPLocalControlModule: NSObject {
  
  var espLocalDevice = ESPDevice(name: "espDevice", security: .unsecure, transport: .softap)
  private let sessionPath = "esp_local_ctrl/session"
  private let versionPath = "esp_local_ctrl/version"

  /// Normalizes `baseUrl` for ESPProvision `ESPSoftAPTransport`, which prepends `http://` when building URLs.

  private func baseUrlForSoftApTransport(_ baseUrl: String) -> String {
    var s = baseUrl.trimmingCharacters(in: .whitespacesAndNewlines)
    let lower = s.lowercased()
    if lower.hasPrefix("https://") {
      s.removeFirst(8)
    } else if lower.hasPrefix("http://") {
      s.removeFirst(7)
    }
    while s.last == "/" {
      s.removeLast()
    }
    return s
  }
  
  /// Checks if the ESP device is connected and has an established session.
  ///
  /// - Parameters:
  ///   - nodeId: The identifier of the ESP device to check.
  ///   - resolve: A callback invoked with a Boolean value indicating the connection status:
  ///       - `true`: The device is connected, and a session is established.
  ///       - `false`: The device is either not connected or the session is not established.
  ///   - reject: A callback invoked with an error message if the check fails.
  @objc(isConnected:resolve:reject:)
  func isConnected(nodeId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    // Check if the provided nodeId matches the name of the local ESP device.
    if espLocalDevice.name != nodeId {
      // If the nodeId not matches, resolve with false as the session is not established.
      resolve(false)
      return
    }
    // Resolve with the session status of the ESP device.
    resolve(espLocalDevice.isSessionEstablished())
  }
  
  /// Establishes a connection to an ESP device using the specified parameters.
  ///
  /// - Parameters:
  ///   - nodeId: The identifier of the ESP device to connect to.
  ///   - baseUrl: LAN base URL, e.g. `http://192.168.1.1:8080` or `192.168.1.1:8080`. A leading `http://` / `https://` is stripped for ESPProvision (see `baseUrlForSoftApTransport`).
  ///   - securityType: The security type to use for the connection.
  ///     - `1`: Secure connection with proof of possession.
  ///     - `2`: Secure connection with proof of possession and username.
  ///     - Default: Unsecure connection.
  ///   - pop: (Optional) Proof of possession, required for security types `1` and `2`.
  ///   - username: (Optional) Username, required for security type `2`.
  ///   - resolve: A callback invoked with a success response when the connection is established.
  ///   - reject: A callback invoked with an error message if the connection fails.
  @objc(connect:baseUrl:securityType:pop:username:resolve:reject:)
  func connect(nodeId: String, baseUrl: String, securityType: NSNumber, pop: String?, username: String?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    // Determine the connection security type and configure the ESPDevice
    // accordingly.
    //
    // Per the ESP-IDF protocomm spec, POP is *optional* for security 1
    // (Curve25519 ECDH key-exchange — works fine without POP if the device
    // firmware doesn't require it; mDNS-discovered on-network devices that
    // advertise `pop_required: false` are exactly this case). POP is *required*
    // for security 2 (SRP6a authenticated handshake). This mirrors what the
    // Android `ESPLocalControlModule` already does — it constructs
    // `Security1(pop)` even when `pop` is null/empty.
    switch securityType {
    case 1:
      // IMPORTANT: pass `""` (not `nil`) when POP isn't supplied. iOS
      // `ESPDevice.initialiseSession` treats `proofOfPossession == nil` as
      // "ask the delegate for POP" via `delegate?.getProofOfPossesion(...)`,
      // and we don't set a delegate — so a `nil` POP would hang the session
      // callback forever. An empty-string POP routes through
      // `initSecureSession(pop: "")` → `ESPSecurity1(proofOfPossession: "")`,
      // which matches Android's `Security1(null/empty)` path.
      espLocalDevice = ESPDevice(
        name: nodeId,
        security: .secure,
        transport: .softap,
        proofOfPossession: pop ?? ""
      )
    case 2:
      // Secure connection with proof of possession and username.
      if let pop = pop, let username = username {
        espLocalDevice = ESPDevice(name: nodeId, security: .secure, transport: .softap, proofOfPossession: pop, username: username)
      } else {
        reject("error", "Username or password is missing", nil)
        return
      }
    default:
      // Unsecure connection.
      espLocalDevice = ESPDevice(name: nodeId, security: .unsecure, transport: .softap)
    }
    
    // Configure the transport layer for the ESPDevice.
    espLocalDevice.espSoftApTransport = ESPSoftAPTransport(baseUrl: baseUrlForSoftApTransport(baseUrl))

    // Security2 IV scheme depends on firmware sec_patch_ver; probe it first.
    if securityType == 2 {
      fetchSecPatchVersion { patchVersion in
        var prov: [String: Any] = ["sec_ver": ESPSecurity.secure2.rawValue]
        if let patchVersion = patchVersion {
          prov["sec_patch_ver"] = patchVersion
        }
        self.espLocalDevice.versionInfo = ["prov": prov] as NSDictionary
        self.establishSession(resolve: resolve, reject: reject)
      }
    } else {
      establishSession(resolve: resolve, reject: reject)
    }
  }

  private func fetchSecPatchVersion(completion: @escaping (Int?) -> Void) {
    espLocalDevice.espSoftApTransport.SendConfigData(path: versionPath, data: Data("---".utf8)) { response, _ in
      guard
        let response = response,
        let json = try? JSONSerialization.jsonObject(with: response) as? [String: Any],
        let localCtrl = json["local_ctrl"] as? [String: Any]
      else {
        completion(nil)
        return
      }
      completion(localCtrl["sec_patch_ver"] as? Int)
    }
  }

  private func establishSession(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    espLocalDevice.initialiseSession(sessionPath: sessionPath) { status in
      switch status {
      case .connected:
        resolve(["status": "success"])
      case .failedToConnect(let eSPSessionError):
        reject("error", eSPSessionError.description, nil)
      case .disconnected:
        reject("error", "Failed to establish session", nil)
      }
    }
  }
  
  /// Sends data to the specified ESP device through a given path.
  ///
  /// - Parameters:
  ///   - nodeId: The identifier of the ESP device to send data to.
  ///   - path: The endpoint path where the data should be sent.
  ///   - data: The data to be sent, which must be a base64 encoded string.
  ///   - resolve: A callback invoked with the base64 encoded response data if the data is successfully sent.
  ///   - reject: A callback invoked with an error message if the data fails to send or if the data is not base64 encoded.``
  @objc(sendData:path:data:resolve:reject:)
  func sendData(nodeId: String, path: String, data: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    // Convert the input data to a Data object using UTF-8 encoding.
    let data: Data = data.data(using: .utf8)!
    
    // Check if the data is base64 encoded. If so, proceed to send the data.
    if let data = Data(base64Encoded: data) {
      var invoked = false
      espLocalDevice.sendData(path: path, data: data, completionHandler: { data, error in
        // Prevent multiple callback invocations
        guard !invoked else { return }
        
        // If an error occurred, reject the promise with the error description.
        if error != nil {
          reject("error", error?.description, nil)
          invoked = true
          return
        }
        
        // Resolve the promise with the base64 encoded response data.
        resolve(data!.base64EncodedString())
        invoked = true
      })
    } else {
      // Reject the promise if the data is not base64 encoded.
      reject("error", "Data is not base64 encoded.", nil)
    }
  }
}

