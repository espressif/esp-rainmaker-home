/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation
import React
import Security

@objc(ESPMatterUtilityModule)
class ESPMatterUtilityModule: NSObject {
  
  // MARK: - RCTBridgeModule Protocol
  
//  override static func moduleName() -> String! {
//    return "ESPMatterUtilityModule"
//  }
//  
//  override static func requiresMainQueueSetup() -> Bool {
//    return false
//  }
  
  // MARK: - Public Methods
  
  /// Check if NOC is stored in iOS Keychain for the given fabric
  /// - Parameters:
  ///   - fabricId: The fabric ID to check
  ///   - resolve: Promise resolve block
  ///   - reject: Promise reject block
  @objc(isUserNocAvailableForFabric:resolver:rejecter:)
  func isUserNocAvailableForFabric(_ fabricId: String,
                                   resolver resolve: @escaping RCTPromiseResolveBlock,
                                   rejecter reject: @escaping RCTPromiseRejectBlock) {
    
    
    guard !fabricId.isEmpty else {
      reject("invalid_params", "fabricId is required", nil)
      return
    }
    
    let account = "user_noc_\(fabricId)"
    let service = ESPMatterConstants.bundleId
    
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: false
    ]
    
    let status = SecItemCopyMatching(query as CFDictionary, nil)
    let exists = status == errSecSuccess
    
    if exists {
      // Verify that the stored data contains valid NOC information
      if let data = loadPrecommissionInfoFromKeychain(fabricId: fabricId),
         let userNoc = data["userNoc"] as? String,
         !userNoc.isEmpty {
        // NOC found and validated
        resolve(true)
      } else {
        // Keychain entry exists but NOC data is invalid
        resolve(false)
      }
    } else {
      // NOC not found in Keychain
      resolve(false)
    }
  }
  
  /// Store pre-commission info in iOS Keychain
  /// - Parameters:
  ///   - params: Dictionary containing pre-commission info
  ///   - resolve: Promise resolve block
  ///   - reject: Promise reject block
  @objc(storePrecommissionInfo:resolver:rejecter:)
  func storePrecommissionInfo(_ params: [String: Any],
                              resolver resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
    
    let groupId = params["groupId"] as? String
    let fabricId = params["fabricId"] as? String
    let name = params["name"] as? String
    let userNoc = params["userNoc"] as? String
    let matterUserId = params["matterUserId"] as? String
    let rootCa = params["rootCa"] as? String
    let ipk = params["ipk"] as? String
    let groupCatIdOperate = params["groupCatIdOperate"] as? String
    let groupCatIdAdmin = params["groupCatIdAdmin"] as? String
    let userCatId = params["userCatId"] as? String
    
    do {
      // Validating required parameters
      guard let groupId = groupId, !groupId.isEmpty,
            let fabricId = fabricId, !fabricId.isEmpty,
            let userNoc = userNoc, !userNoc.isEmpty,
            let rootCa = rootCa, !rootCa.isEmpty,
            let matterUserId = matterUserId, !matterUserId.isEmpty else {
        reject("INVALID_PARAMS", "Group ID, Fabric ID, User NOC, Root CA, and Matter User ID are required", nil)
        return
      }
      
      // Storing pre-commission info in iOS Keychain
      var precommissionData: [String: Any] = [
        "userNoc": userNoc,
        "matterUserId": matterUserId,
        "rootCa": rootCa,
        "groupId": groupId
      ]
      
      // Add optional fields if present
      if let name = name {
        precommissionData["name"] = name
      }
      if let ipk = ipk {
        precommissionData["ipk"] = ipk
      }
      if let groupCatIdOperate = groupCatIdOperate {
        precommissionData["groupCatIdOperate"] = groupCatIdOperate
      }
      if let groupCatIdAdmin = groupCatIdAdmin {
        precommissionData["groupCatIdAdmin"] = groupCatIdAdmin
      }
      if let userCatId = userCatId {
        precommissionData["userCatId"] = userCatId
      }
      
      // Convert to JSON data
      let jsonData = try JSONSerialization.data(withJSONObject: precommissionData)
      
      // Store in iOS Keychain
      let account = "user_noc_\(fabricId)"
      let service = Bundle.main.bundleIdentifier ?? "com.espressif.nova"
      
      // Delete existing item first
      let deleteQuery: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: account,
        kSecAttrService as String: service
      ]
      SecItemDelete(deleteQuery as CFDictionary)
      
      // Add new item
      let addQuery: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: account,
        kSecAttrService as String: service,
        kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        kSecValueData as String: jsonData
      ]
      
      let status = SecItemAdd(addQuery as CFDictionary, nil)
      guard status == errSecSuccess else {
        let error = NSError(domain: "ESPMatterUtilityModule", code: Int(status), userInfo: [
          NSLocalizedDescriptionKey: "Failed to store pre-commission info in Keychain: \(status)"
        ])
        // Failed to store in Keychain
        reject("KEYCHAIN_ERROR", "Failed to store pre-commission info: \(error.localizedDescription)", error)
        return
      }
      let storeResult: [String: Any] = [
        "success": true,
        "message": "Pre-commission info stored successfully",
        "groupId": groupId,
        "fabricId": fabricId,
        "name": name ?? "",
        "matterUserId": matterUserId
      ]
      
      resolve(storeResult)
    } catch {
      reject("STORE_PRECOMMISSION_ERROR", "Failed to store pre-commission info: \(error.localizedDescription)", error)
    }
  }
  
  // MARK: - Private Helper Methods
  
  /// Load pre-commission info from iOS Keychain
  /// - Parameter fabricId: The fabric ID
  /// - Returns: Dictionary containing pre-commission info, or nil if not found
  private func loadPrecommissionInfoFromKeychain(fabricId: String) -> [String: Any]? {
    let account = "user_noc_\(fabricId)"
    let service = ESPMatterConstants.bundleId
    
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true
    ]
    
    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    
    guard status == errSecSuccess,
          let data = result as? Data,
          let precommissionDict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return nil
    }
    
    return precommissionDict
  }
}

