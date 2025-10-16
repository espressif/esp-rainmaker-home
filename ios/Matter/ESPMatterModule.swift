/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation
import React
import Matter
import MatterSupport
import Security

// MARK: - RainMaker Cluster Constants

struct RainMakerCluster {
  static let clusterId: UInt32 = 320601088 // 0x131bfc00
  
  struct Attributes {
    static let rainmakerNodeId: UInt32 = 1
    static let challenge: UInt32 = 2
    static let matterNodeId: UInt32 = 3
  }
  
  struct Commands {
    static let sendNodeId: UInt32 = 1
  }
}

@available(iOS 16.4, *)
@objc(ESPMatterModule)
class ESPMatterModule: RCTEventEmitter {
  
  // MARK: - Properties
  private let csrQueue = DispatchQueue(label: ESPMatterConstants.csrQueueLabel, qos: .userInitiated)
  private let matterQueue = DispatchQueue(label: ESPMatterConstants.matterQueueLabel, qos: .userInitiated)
  
  // Matter Event Identifier
  private let matterEventIdentifier: String = ESPMatterConstants.matterEventIdentifier
  
  // Store commissioning state
  private var currentFabricInfo: [String: Any]?
  private var currentCommissioningCompletion: RCTPromiseResolveBlock?
  private var currentCommissioningReject: RCTPromiseRejectBlock?
  
  // Matter controller and commissioning state
  private var currentMatterController: MTRDeviceController?
  private var currentDeviceId: UInt64?
  private var currentMatterNodeId: UInt64?
  private var currentRequestId: String?
  private var currentNOCCompletion: ((MTROperationalCertificateChain?, Error?) -> Void)?
  
  // RainMaker device properties
  private var rainmakerNodeId: String?
  private var isRainMakerDevice: Bool = false
  
  // MARK: - RCTEventEmitter Override
  override func supportedEvents() -> [String]! {
    return [
      matterEventIdentifier
    ]
  }
  
  override static func requiresMainQueueSetup() -> Bool {
    return false
  }
  
  // MARK: - Event Emission
  
  private func emitMatterEvent(eventType: String, data: [String: Any]) {
    let eventData: [String: Any] = [
      ESPMatterConstants.eventType: eventType,
      ESPMatterConstants.requestBody: data
    ]
    sendEvent(withName: matterEventIdentifier, body: eventData)
  }
  
  
  
  // MARK: - CSR Generation Methods
  
  /// Generate Certificate Signing Request for fabric
  /// This method generates a CSR using iOS Keychain and prepares the request body
  /// - Parameter fabricInfo: Dictionary containing groupId, fabricId, and name (matching ESPRMGenerateCSRRequest)
  @objc func generateCSR(_ fabricInfo: [String: Any],
                         resolver resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
    
    guard let groupId = fabricInfo[ESPMatterConstants.groupId] as? String,
          let fabricId = fabricInfo[ESPMatterConstants.fabricId] as? String,
          let name = fabricInfo[ESPMatterConstants.name] as? String else {
      reject(ESPMatterConstants.invalidParams, ESPMatterConstants.missingRequiredParams, nil)
      return
    }
    
    csrQueue.async {
      do {
        // Generate CSR using iOS Keychain
        let csr = try self.generateCSRForFabric(groupId: groupId)
        
        let csrRequest: [String: Any] = [
          ESPMatterConstants.groupIdKeyDict: groupId,
          ESPMatterConstants.csr: csr
        ]
        
        let requestBody: [String: Any] = [
          ESPMatterConstants.operation: ESPMatterConstants.operationAdd,
          ESPMatterConstants.csrType: ESPMatterConstants.user,
          ESPMatterConstants.csrRequests: [csrRequest]
        ]
        
        let response: [String: Any] = [
          ESPMatterConstants.csr: csr,
          ESPMatterConstants.requestBody: try self.jsonString(from: requestBody),
          ESPMatterConstants.groupId: groupId,
          ESPMatterConstants.fabricId: fabricId,
          ESPMatterConstants.name: name
        ]
        
        DispatchQueue.main.async {
          resolve(response)
        }
        
      } catch {
        // Failed to generate CSR
        DispatchQueue.main.async {
          reject(ESPMatterConstants.csrGenerationFailed, String(format: ESPMatterConstants.failedToGenerateCSR, error.localizedDescription), error)
        }
      }
    }
  }
  
  // MARK: - Matter Commissioning Methods
  
  /// Start Matter ecosystem commissioning
  /// This method starts the native commissioning process for Matter devices
  @objc func startEcosystemCommissioning(_ onboardingPayload: String,
                                         fabric: [String: Any],
                                         resolver resolve: @escaping RCTPromiseResolveBlock,
                                         rejecter reject: @escaping RCTPromiseRejectBlock) {
    
    // Store commissioning state
    currentFabricInfo = fabric
    currentCommissioningCompletion = resolve
    currentCommissioningReject = reject
    
    matterQueue.async {
      do {
        // Step 1: Apple Fabric Commissioning (using MatterSupport)
        try self.startAppleFabricCommissioning(qrData: onboardingPayload, fabric: fabric)
        // Note: Custom fabric commissioning will be triggered after Apple commissioning complete
      } catch {
        DispatchQueue.main.async {
          reject(ESPMatterConstants.commissioningFailed, String(format: ESPMatterConstants.failedToStartCommissioning, error.localizedDescription), error)
        }
      }
    }
  }
  
  // MARK: - Post Message Method (Unified Message Router)
  
  /// Unified method to route different types of data to appropriate native methods
  @objc func postMessage(_ payload: [String: Any],
                         resolver resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
    
    guard let type = payload[ESPMatterConstants.type] as? String else {
      reject(ESPMatterConstants.invalidPayload, ESPMatterConstants.postMessageRequiresType, nil)
      return
    }
    
    guard let data = payload[ESPMatterConstants.data] as? [String: Any] else {
      reject(ESPMatterConstants.invalidPayload, ESPMatterConstants.postMessageRequiresData, nil)
      return
    }
    
    switch type {
    case ESPMatterConstants.issueNodeNocResponse:
      var nocResponse: [String: Any] = [:]
      
      // Extract nodeNoc (can be operationalCert or nodeNoc)
      if let nodeNoc = data[ESPMatterConstants.nodeNoc] as? String {
        nocResponse[ESPMatterConstants.nodeNoc] = nodeNoc
      } else if let operationalCert = data[ESPMatterConstants.operationalCert] as? String {
        nocResponse[ESPMatterConstants.nodeNoc] = operationalCert
      }
      
      // Extract matterNodeId
      if let matterNodeId = data[ESPMatterConstants.matterNodeId] as? String {
        nocResponse[ESPMatterConstants.matterNodeId] = matterNodeId
      }
      
      // Extract requestId
      if let requestId = data[ESPMatterConstants.requestId] as? String {
        nocResponse[ESPMatterConstants.requestId] = requestId
      }
      
      sendNocResponse(nocResponse, resolver: resolve, rejecter: reject)
      
    case ESPMatterConstants.commissioningConfirmationResponse:
      // Route to sendConfirmResponse
      sendConfirmResponse(data, resolver: resolve, rejecter: reject)
      
    case ESPMatterConstants.csrGenerationResponse, ESPMatterConstants.fabricCreationResponse, ESPMatterConstants.startCommissioningResponse:
      // Map to NOC response format
      var nocResponse: [String: Any] = [:]
      
      if let nodeNoc = data[ESPMatterConstants.nodeNoc] as? String {
        nocResponse[ESPMatterConstants.nodeNoc] = nodeNoc
      }
      
      if let matterNodeId = data[ESPMatterConstants.matterNodeId] as? String {
        nocResponse[ESPMatterConstants.matterNodeId] = matterNodeId
      }
      
      if let requestId = data[ESPMatterConstants.requestId] as? String {
        nocResponse[ESPMatterConstants.requestId] = requestId
      }
    
      sendNocResponse(nocResponse, resolver: resolve, rejecter: reject)
      
    default:
      reject(ESPMatterConstants.unsupportedPostMessage, String(format: ESPMatterConstants.unsupportedPostMessageType, type), nil)
    }
  }
  
  // MARK: - NOC Response Methods (for device commissioning)
  
  /// Send NOC response to Matter framework
  @objc func sendNocResponse(_ nocResponse: [String: Any],
                             resolver resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
    
    guard let completion = currentNOCCompletion else {
      reject(ESPMatterConstants.noCompletionHandler, ESPMatterConstants.noNocCompletionHandler, nil)
      return
    }
    
    // Extract NOC data from response
    guard let nodeNoc = nocResponse[ESPMatterConstants.nodeNoc] as? String,
          let matterNodeId = nocResponse[ESPMatterConstants.matterNodeId] as? String else {
      let error = NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: ESPMatterConstants.missingRequiredNocData
      ])
      completion(nil, error)
      currentNOCCompletion = nil
      reject(ESPMatterConstants.invalidNocResponse, ESPMatterConstants.missingRequiredNocData, error)
      return
    }
    
    if let requestId = nocResponse[ESPMatterConstants.requestId] as? String {
      currentRequestId = requestId
    }
    
    if let matterNodeIdUInt64 = UInt64(matterNodeId, radix: 16) {
      currentMatterNodeId = matterNodeIdUInt64
    }
    
    // Convert NOC from PEM to DER format
    guard let nocDerData = convertPEMToDER(nodeNoc) else {
      let error = NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: ESPMatterConstants.failedToConvertNoc
      ])
      completion(nil, error)
      currentNOCCompletion = nil
      reject(ESPMatterConstants.nocConversionFailed, ESPMatterConstants.failedToConvertNoc, error)
      return
    }
    
    // Create operational certificate chain
    // Get the root CA certificate from the current fabric
    guard let fabricInfo = currentFabricInfo,
          let fabricDetails = fabricInfo[ESPMatterConstants.fabricDetails] as? [String: Any],
          let rootCaString = fabricDetails[ESPMatterConstants.rootCa] as? String,
          let rootCaDerData = convertPEMToDER(rootCaString) else {
      let error = NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: ESPMatterConstants.failedToGetRootCa
      ])
      completion(nil, error)
      currentNOCCompletion = nil
      reject(ESPMatterConstants.rootCaNotFound, ESPMatterConstants.rootCaNotFoundMsg, error)
      return
    }
    
    let certificateChain = MTROperationalCertificateChain(
      operationalCertificate: nocDerData,
      intermediateCertificate: nil,
      rootCertificate: rootCaDerData, // Use actual root CA from fabric
      adminSubject: nil
    )
    
    // Call the completion handler with the certificate chain
    completion(certificateChain, nil)
    currentNOCCompletion = nil
    resolve([ESPMatterConstants.success: true, ESPMatterConstants.message: ESPMatterConstants.nocResponseProcessed])
  }
  
  /// Send confirmation response
  @objc func sendConfirmResponse(_ confirmResponse: [String: Any],
                                 resolver resolve: @escaping RCTPromiseResolveBlock,
                                 rejecter reject: @escaping RCTPromiseRejectBlock) {
    
    let deviceNameFromAppleCommissioning = ESPMatterEcosystemInfo.shared.getDeviceName()
    
    // Clean up the device name from shared storage after retrieving it
    if deviceNameFromAppleCommissioning != nil {
      ESPMatterEcosystemInfo.shared.removeDeviceName()
    }
    
    let finalDeviceName = deviceNameFromAppleCommissioning ?? confirmResponse[ESPMatterConstants.deviceName] as? String ?? ESPMatterConstants.defaultDeviceName
    
    let status = confirmResponse[ESPMatterConstants.status] as? String ?? ESPMatterConstants.success
    let rainmakerNodeId = confirmResponse[ESPMatterConstants.rainmakerNodeId] as? String ?? ""
    let matterNodeId = confirmResponse[ESPMatterConstants.matterNodeIdKey] as? String ?? ""
    let isRainmakerNode = confirmResponse[ESPMatterConstants.isRainmakerNode] as? Bool ?? false
    
    let commissioningCompleteEvent: [String: Any] = [
      ESPMatterConstants.eventType: ESPMatterConstants.commissioningComplete,
      ESPMatterConstants.status: status,
      ESPMatterConstants.deviceId: matterNodeId.isEmpty ? (currentMatterNodeId?.description ?? currentDeviceId?.description ?? ESPMatterConstants.unknown) : matterNodeId,
      ESPMatterConstants.deviceName: finalDeviceName,
      ESPMatterConstants.fabricName: currentFabricInfo?[ESPMatterConstants.name] as? String ?? ESPMatterConstants.unknownFabric,
      ESPMatterConstants.message: ESPMatterConstants.iosCommissioningCompleted,
      ESPMatterConstants.source: ESPMatterConstants.iosMatterFramework,
      ESPMatterConstants.isRainmakerNode: isRainmakerNode,
      ESPMatterConstants.rainmakerNodeId: rainmakerNodeId,
      ESPMatterConstants.matterNodeId: matterNodeId
    ]
    
    emitMatterEvent(eventType: ESPMatterConstants.commissioningComplete, data: commissioningCompleteEvent)
    
    currentCommissioningCompletion = nil
    currentCommissioningReject = nil
    currentFabricInfo = nil
    currentDeviceId = nil
    currentMatterNodeId = nil
    currentRequestId = nil
    
    resolve([ESPMatterConstants.success: true, ESPMatterConstants.message: ESPMatterConstants.confirmationResponseSent])
  }
  
  // MARK: - Private Helper Methods
  
  /// Start Apple fabric commissioning using MatterSupport framework
  private func startAppleFabricCommissioning(qrData: String, fabric: [String: Any]) throws {
    
    guard let fabricName = fabric[ESPMatterConstants.name] as? String else {
      throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: ESPMatterConstants.fabricNameRequired
      ])
    }
    
    // Import MatterSupport framework for Apple commissioning
    if #available(iOS 16.4, *) {
      Task {
        do {
          if let setupPayload = try? MTRSetupPayload(onboardingPayload: qrData) {
            // Create MatterAddDeviceRequest topology
            let topology = MatterAddDeviceRequest.Topology(
              ecosystemName: ESPMatterConstants.ecosystemName,
              homes: [MatterAddDeviceRequest.Home(displayName: fabricName)]
            )
            let setupRequest = MatterAddDeviceRequest(topology: topology, setupPayload: setupPayload)
            
            try await setupRequest.perform()
                        
            // Step 2: Start custom fabric commissioning after Apple commissioning
            if let qrData = ESPMatterEcosystemInfo.shared.getOnboardingPayload() {
              try await self.startCustomFabricCommissioning(qrData: qrData, fabric: fabric)
            }
          }
        } catch {
          if let qrData = ESPMatterEcosystemInfo.shared.getOnboardingPayload() {
            try await self.startCustomFabricCommissioning(qrData: qrData, fabric: fabric)
          } else {
              self.currentCommissioningReject?(ESPMatterConstants.appleCommissioningFailed,
                                               String(format: ESPMatterConstants.appleCommissioningFailedMsg, error.localizedDescription),
                                               error)
          }
        }
      }
    } else {
      throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: ESPMatterConstants.matterRequiresIOS164
      ])
    }
  }
  
  /// Start custom fabric commissioning to ESP RainMaker Home fabric
  private func startCustomFabricCommissioning(qrData: String, fabric: [String: Any]) async throws {
    
    guard let groupId = fabric[ESPMatterConstants.id] as? String else {
      throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: ESPMatterConstants.fabricIdRequired
      ])
    }
    
    let fabricId = fabric[ESPMatterConstants.fabricId] as? String ?? groupId
    
    // Check if user NOC exists for this fabric (using fabricId to match storage)
    let userNOCExists = checkUserNOCExists(fabricId: fabricId)
    if !userNOCExists {
      throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: String(format: ESPMatterConstants.userNocNotFound, fabricId)
      ])
    }
    
    // Initialize Matter controller with user NOC
    try initializeMatterControllerWithFabric(fabric)
    
    // Start commissioning with user NOC
    try startMatterCommissioningWithUserNOC(qrData: qrData)
    
  }
  
  /// Check if user NOC exists in iOS Keychain for the given fabric
  /// - Parameter fabricId: Fabric ID used as the storage key (matches ESPMatterUtilityModule storage)
  private func checkUserNOCExists(fabricId: String) -> Bool {
    
    let account = "user_noc_\(fabricId)"
    let service = Bundle.main.bundleIdentifier ?? "com.espressif.nova"
    
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: false
    ]
    
    let status = SecItemCopyMatching(query as CFDictionary, nil)
    let exists = status == errSecSuccess
    
    return exists
  }
  
  /// Initialize Matter controller with fabric details and user NOC
  private func initializeMatterControllerWithFabric(_ fabric: [String: Any]) throws {
    
    guard let groupId = fabric[ESPMatterConstants.id] as? String else {
      throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: ESPMatterConstants.fabricIdRequiredForInit
      ])
    }
    
    let fabricId = fabric[ESPMatterConstants.fabricId] as? String ?? groupId
    let userNOCData = loadUserNOCFromKeychain(fabricId: fabricId)
    
    let userNOC = userNOCData[ESPMatterConstants.userNOC] as? String ?? userNOCData[ESPMatterConstants.userNoc] as? String
    guard let userNOC = userNOC,
          let matterUserId = userNOCData[ESPMatterConstants.matterUserId] as? String,
          let rootCa = userNOCData[ESPMatterConstants.rootCa] as? String else {
      throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: String(format: ESPMatterConstants.userNocDataNotFound, fabricId)
      ])
    }
    
    // Shutdown existing controller if any
    shutdownMatterController()
    
    // Initialize Matter controller factory
    let storage = ESPMatterStorage()
    let factory = MTRDeviceControllerFactory.sharedInstance()
    let factoryParams = MTRDeviceControllerFactoryParams(storage: storage)
    
    do {
      try factory.start(factoryParams)
    } catch {
      throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: String(format: ESPMatterConstants.failedToStartFactory, error.localizedDescription)
      ])
    }
    
    // Create CSR keys for this fabric
    let csrKeys = MTRCSRKeys(groupId: groupId)
    
    // Convert PEM certificates to DER format
    guard let rootCADerBytes = convertPEMToDER(rootCa),
          let nocDerBytes = convertPEMToDER(userNOC) else {
      throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: ESPMatterConstants.failedToConvertCerts
      ])
    }
    
    // Create Matter controller startup parameters
    let params = MTRDeviceControllerStartupParams(
      ipk: csrKeys.ipk,
      operationalKeypair: csrKeys,
      operationalCertificate: nocDerBytes,
      intermediateCertificate: nil,
      rootCertificate: rootCADerBytes
    )
    
    // Set vendor ID
    params.vendorID = NSNumber(value: 0xFFF1) // Espressif vendor ID
    params.operationalCertificateIssuer = self
    params.operationalCertificateIssuerQueue = matterQueue
    
    // Create Matter controller
    do {
      // Try creating controller on existing fabric first
      currentMatterController = try factory.createController(onExistingFabric: params)
      currentMatterController?.setDeviceControllerDelegate(self, queue: self.matterQueue)
    } catch {
      do {
        // If existing fabric fails, create new fabric
        currentMatterController = try factory.createController(onNewFabric: params)
        currentMatterController?.setDeviceControllerDelegate(self, queue: self.matterQueue)
      } catch {
        throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
          NSLocalizedDescriptionKey: String(format: ESPMatterConstants.failedToCreateController, error.localizedDescription)
        ])
      }
    }
    
    guard let controller = currentMatterController else {
      throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: ESPMatterConstants.controllerNilAfterCreation
      ])
    }
    
    // Set controller delegate for commissioning callbacks
    controller.setDeviceControllerDelegate(self, queue: matterQueue)
  }
  
  /// Start Matter commissioning with user NOC
  private func startMatterCommissioningWithUserNOC(qrData: String) throws {
    
    guard let controller = currentMatterController else {
      throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: ESPMatterConstants.controllerNotInitialized
      ])
    }
    
    // Generate unique device ID for commissioning
    let deviceId = UInt64(Date().timeIntervalSince1970 * 1000) + UInt64.random(in: 1...999)
    currentDeviceId = deviceId
    
    // Parse QR code payload with improved error handling
    guard let setupPayload = try? MTRSetupPayload(onboardingPayload: qrData) else {
      throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: ESPMatterConstants.failedToParseQR
      ])
    }
    
    // Setup commissioning session (synchronous call)
    do {
      try controller.setupCommissioningSession(with: setupPayload, newNodeID: NSNumber(value: deviceId))
    } catch {
      emitMatterEvent(eventType: ESPMatterConstants.commissioningComplete, data: [
        ESPMatterConstants.success: false,
        ESPMatterConstants.error: String(format: ESPMatterConstants.failedToSetupSession, error.localizedDescription),
        ESPMatterConstants.eventType: ESPMatterConstants.commissioningComplete
      ])
      throw error
    }
  }
  
  /// Generate CSR for fabric using iOS Keychain
  private func generateCSRForFabric(groupId: String) throws -> String {
    
    // Create CSR keys using iOS Keychain
    let csrKeys = MTRCSRKeys(groupId: groupId)
    
    // Generate CSR using Matter framework
    let csrData = try MTRCertificates.createCertificateSigningRequest(csrKeys)
    
    // Convert to PEM format
    let csrBase64 = csrData.base64EncodedString()
    let csrPEM = "\(ESPMatterConstants.beginCertificateRequest)\n\(csrBase64)\n\(ESPMatterConstants.endCertificateRequest)"
    
    return csrPEM
  }
  
  /// Load user NOC from iOS Keychain
  /// - Parameter fabricId: Fabric ID used as the storage key
  private func loadUserNOCFromKeychain(fabricId: String) -> [String: Any] {
    
    // Use fabricId to match storage key in ESPMatterUtilityModule.storePrecommissionInfo
    let account = "\(ESPMatterConstants.userNocPrefix)\(fabricId)"
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
          let userNOCDict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return [:]
    }
    
    return userNOCDict
  }
  
  /// Shutdown existing Matter controller
  private func shutdownMatterController() {
    
    if let controller = currentMatterController {
      controller.shutdown()
      currentMatterController = nil
    }
    
    // Also shutdown the factory if it's running
    let factory = MTRDeviceControllerFactory.sharedInstance()
    if factory.isRunning {
      factory.stop()
    }
  }
  
  /// Convert PEM certificate to DER format
  private func convertPEMToDER(_ pemString: String) -> Data? {
    // Remove PEM headers and whitespace
    let cleanPEM = pemString
      .replacingOccurrences(of: ESPMatterConstants.beginCertificate, with: "")
      .replacingOccurrences(of: ESPMatterConstants.endCertificate, with: "")
      .replacingOccurrences(of: ESPMatterConstants.beginCertificateRequest, with: "")
      .replacingOccurrences(of: ESPMatterConstants.endCertificateRequest, with: "")
      .replacingOccurrences(of: "\n", with: "")
      .replacingOccurrences(of: "\r", with: "")
      .replacingOccurrences(of: " ", with: "")
    
    // Convert base64 to data
    return Data(base64Encoded: cleanPEM)
  }
  
  /// Store user NOC in iOS Keychain
  private func storeUserNOCInKeychain(groupId: String, userNoc: String, matterUserId: String, rootCa: String?) throws {
    
    // Create user NOC data structure
    let userNOCData: [String: Any] = [
      ESPMatterConstants.userNOC: userNoc,
      ESPMatterConstants.matterUserId: matterUserId,
      ESPMatterConstants.rootCa: rootCa ?? "",
      ESPMatterConstants.groupId: groupId,
      ESPMatterConstants.timestamp: ISO8601DateFormatter().string(from: Date())
    ]
    
    // Convert to JSON data
    let jsonData = try JSONSerialization.data(withJSONObject: userNOCData)
    
    // Store in iOS Keychain
    let account = "\(ESPMatterConstants.userNocPrefix)\(groupId)"
    let service = ESPMatterConstants.bundleId
    
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
      throw NSError(domain: ESPMatterConstants.moduleDomain, code: Int(status), userInfo: [
        NSLocalizedDescriptionKey: ESPMatterConstants.failedToStoreNoc
      ])
    }
  }
  
  
  /// Convert dictionary to JSON string
  private func jsonString(from dictionary: [String: Any]) throws -> String {
    let jsonData = try JSONSerialization.data(withJSONObject: dictionary)
    return String(data: jsonData, encoding: .utf8) ?? ""
  }
  
  /// Perform post-commissioning actions immediately
  private func performPostCommissioningActionsImmediate() {
    
    guard let fabricInfo = currentFabricInfo,
          let groupId = fabricInfo[ESPMatterConstants.id] as? String,
          let controller = currentMatterController else {
      return
    }
    
    //Use the actual Matter Node ID from NOC response
    let deviceId: UInt64
    if let matterNodeId = currentMatterNodeId {
      deviceId = matterNodeId
    } else if let tempDeviceId = currentDeviceId {
      deviceId = tempDeviceId
    } else {
      return
    }
    
    var device: MTRBaseDevice? = nil
    
    if let commissionedDevice = try? controller.getDeviceBeingCommissioned(deviceId) {
      device = commissionedDevice
    } else {
      device = MTRBaseDevice(nodeID: NSNumber(value: deviceId), controller: controller)
    }
    
    guard let matterDevice = device else {
      performPostCommissioningActions()
      return
    }
    
    detectDeviceTypeImmediate(device: matterDevice, deviceId: deviceId, groupId: groupId)
  }
  
  /// Perform post-commissioning actions with RainMaker cluster detection (Fallback with delays)
  private func performPostCommissioningActions() {
    
    guard let fabricInfo = currentFabricInfo,
          let groupId = fabricInfo[ESPMatterConstants.id] as? String else {
      return
    }
    
    let deviceId: UInt64
    if let matterNodeId = currentMatterNodeId {
      deviceId = matterNodeId
    } else if let tempDeviceId = currentDeviceId {
      deviceId = tempDeviceId
    } else {
      return
    }
    
    // Step 1: Detect if device supports RainMaker cluster
    detectDeviceType(deviceId: deviceId) { [weak self] isRainMaker in
      guard let self = self else { return }
      
      self.isRainMakerDevice = isRainMaker
      
      if isRainMaker {
        self.handleRainMakerDevice(deviceId: deviceId, groupId: groupId)
      } else {
        self.handlePureMatterDevice(deviceId: deviceId, groupId: groupId)
      }
    }
  }
  
  // MARK: - RainMaker Device Detection and Handling
  
  private func detectDeviceTypeImmediate(device: MTRBaseDevice, deviceId: UInt64, groupId: String) {
    
    // Read descriptor cluster to get server clusters list (same as Android)
    let endpointId = NSNumber(value: 0) // Endpoint 0
    let descriptorClusterId = NSNumber(value: 29) // Descriptor cluster ID
    let serverListAttributeId = NSNumber(value: 1) // Server list attribute
    
    device.readAttributes(withEndpointID: nil,
                          clusterID: nil,
                          attributeID: nil,
                          params: nil,
                          queue: matterQueue) { [weak self] values, error in
      
      guard let self = self else {
        return
      }
      
      guard let values = values else {
        self.detectDeviceType(deviceId: deviceId) { isRainMaker in
          if isRainMaker {
            self.handleRainMakerDevice(deviceId: deviceId, groupId: groupId)
          } else {
            self.handlePureMatterDevice(deviceId: deviceId, groupId: groupId)
          }
        }
        return
      }
      
      if let error = error {
        self.detectDeviceType(deviceId: deviceId) { isRainMaker in
          if isRainMaker {
            self.handleRainMakerDevice(deviceId: deviceId, groupId: groupId)
          } else {
            self.handlePureMatterDevice(deviceId: deviceId, groupId: groupId)
          }
        }
        return
      }
      
      let deviceInfo = ESPMatterModule.parseDeviceInfo(from: values)
      
      // Check for RainMaker cluster in server lists
      var isRainMakerClusterFound = false
      var totalServerClusters: [UInt32] = []
      
      for endpoint in deviceInfo.endpoints {
        for server in endpoint.servers {
          totalServerClusters.append(server.id)
          
          // Check for RainMaker cluster
          if server.id == RainMakerCluster.clusterId {
            isRainMakerClusterFound = true
          }
        }
      }
      
      // Store parsed device info and server clusters data
      self.storeDeviceInfo(deviceId: deviceId, groupId: groupId, deviceInfo: deviceInfo)
      self.storeServerClustersData(deviceId: deviceId, groupId: groupId, serverClusters: totalServerClusters)
      
      // Handle device based on detection result
      self.isRainMakerDevice = isRainMakerClusterFound
      
      if isRainMakerClusterFound {
        self.handleRainMakerDevice(deviceId: deviceId, groupId: groupId)
      } else {
        self.handlePureMatterDevice(deviceId: deviceId, groupId: groupId)
      }
    }
  }
  
  private func detectDeviceType(deviceId: UInt64, completion: @escaping (Bool) -> Void) {
    guard let controller = currentMatterController else {
      completion(false)
      return
    }
    
    // Add delay and retry logic for device detection
    DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
      self?.performClusterDetection(controller: controller, deviceId: deviceId, retryCount: 0, completion: completion)
    }
  }
  
  /// Perform cluster detection with retry logic
  private func performClusterDetection(controller: MTRDeviceController, deviceId: UInt64, retryCount: Int, completion: @escaping (Bool) -> Void) {
    let maxRetries = 3
    
    // Get connected device
    controller.getBaseDevice(deviceId, queue: matterQueue) { [weak self] device, error in
      guard let self = self else {
        completion(false)
        return
      }
      
      guard let device = device, error == nil else {
        if retryCount < maxRetries {
          DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            self.performClusterDetection(controller: controller, deviceId: deviceId, retryCount: retryCount + 1, completion: completion)
          }
        } else {
          completion(false)
        }
        return
      }
      
      // Read descriptor cluster to get server clusters list
      let endpointId = NSNumber(value: 0) // Endpoint 0
      let descriptorClusterId = NSNumber(value: 29) // Descriptor cluster ID
      let serverListAttributeId = NSNumber(value: 1) // Server list attribute
      
      device.readAttributes(withEndpointID: endpointId,
                            clusterID: descriptorClusterId,
                            attributeID: serverListAttributeId,
                            params: nil,
                            queue: self.matterQueue) { values, error in
        
        guard let values = values, error == nil else {
          if retryCount < maxRetries {
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
              self.performClusterDetection(controller: controller, deviceId: deviceId, retryCount: retryCount + 1, completion: completion)
            }
          } else {
            completion(false)
          }
          return
        }
        
        // Check if RainMaker cluster is in the server list
        var isRainMakerClusterFound = false
        
        for value in values {
          if let data = value["data"] as? [String: Any],
             let arrayValue = data["value"] as? [Any] {
            
            for clusterValue in arrayValue {
              if let clusterDict = clusterValue as? [String: Any],
                 let clusterId = clusterDict["value"] as? UInt32 {
                
                if clusterId == RainMakerCluster.clusterId {
                  isRainMakerClusterFound = true
                  break
                }
              }
            }
            
            if isRainMakerClusterFound {
              break
            }
          }
        }
        
        completion(isRainMakerClusterFound)
      }
    }
  }
  
  /// Handle RainMaker + Matter hybrid device
  private func handleRainMakerDevice(deviceId: UInt64, groupId: String) {
    
    // Step 1: Read RainMaker Node ID from device
    readRainMakerNodeId(deviceId: deviceId) { [weak self] rainmakerNodeId in
      guard let self = self else { return }
      
      if let rainmakerNodeId = rainmakerNodeId {
        self.rainmakerNodeId = rainmakerNodeId
        
        // Step 2: Send Matter Node ID to device
        let matterNodeIdHex = String(format: ESPMatterConstants.matterNodeIdFormat, deviceId) // Convert to 16-digit hex
        self.sendMatterNodeIdToDevice(deviceId: deviceId, matterNodeId: matterNodeIdHex) { success in
          if success {
            // Step 3: Read challenge from device
            self.readChallengeFromDevice(deviceId: deviceId) { challenge in
              if let challenge = challenge {
                // Step 4: Confirm RainMaker commissioning with challenge
                self.confirmRainMakerCommissioning(deviceId: deviceId, groupId: groupId,
                                                   rainmakerNodeId: rainmakerNodeId, challenge: challenge)
              } else {
                self.handlePureMatterDevice(deviceId: deviceId, groupId: groupId)
              }
            }
          } else {
            self.handlePureMatterDevice(deviceId: deviceId, groupId: groupId)
          }
        }
      } else {
        self.handlePureMatterDevice(deviceId: deviceId, groupId: groupId)
      }
    }
  }
  
  /// Handle pure Matter device
  private func handlePureMatterDevice(deviceId: UInt64, groupId: String) {
    
    // Retrieve device name from Apple commissioning shared storage
    let deviceNameFromAppleCommissioning = ESPMatterEcosystemInfo.shared.getDeviceName()
    let deviceName = deviceNameFromAppleCommissioning ?? ESPMatterConstants.defaultDeviceName
    
    let matterNodeIdHex = String(format: ESPMatterConstants.matterNodeIdFormat, deviceId)
    let matterMetadata: [String: Any] = [
      ESPMatterConstants.isRainmakerNode: false,
      ESPMatterConstants.matterNodeIdKey: matterNodeIdHex,
      ESPMatterConstants.deviceType: ESPMatterConstants.pureMatterDeviceType,
      ESPMatterConstants.deviceName: deviceName
    ]
    
    let metadata: [String: Any] = [
      ESPMatterConstants.matter: matterMetadata
    ]
    
    let requestData: [String: Any] = [
      ESPMatterConstants.requestId: currentRequestId ?? String(deviceId),
      ESPMatterConstants.status: ESPMatterConstants.success,
      ESPMatterConstants.deviceName: deviceName,
      ESPMatterConstants.metadata: metadata
    ]
    
    emitMatterEvent(eventType: ESPMatterConstants.commissioningConfirmationRequest, data: requestData)
  }
  
  /// Store parsed device info
  private func storeDeviceInfo(deviceId: UInt64, groupId: String, deviceInfo: MatterDeviceInfo) {
    // Convert to JSON format and store
    let jsonFormat = ESPMatterModule.convertToJSONFormat(from: deviceInfo)
    
    let key = "\(ESPMatterConstants.matterDeviceInfoPrefix)\(groupId)_\(deviceId)"
    if let jsonData = try? JSONSerialization.data(withJSONObject: jsonFormat),
       let jsonString = String(data: jsonData, encoding: .utf8) {
      UserDefaults.standard.set(jsonString, forKey: key)
    }
  }
  
  /// Store server clusters data for device
  private func storeServerClustersData(deviceId: UInt64, groupId: String, serverClusters: [UInt32]) {
  
    let clustersData: [String: [UInt32]] = [
      "0": serverClusters // Endpoint 0 clusters
    ]
    
    let key = "\(ESPMatterConstants.matterClustersPrefix)\(groupId)_\(deviceId)"
    let clustersArray = serverClusters.map { Int($0) }
    UserDefaults.standard.set(clustersArray, forKey: key)
  }
  
  private func isRainmakerClusterSupported(deviceId: UInt64, groupId: String) -> (Bool, String?) {
    let key = "\(ESPMatterConstants.matterClustersPrefix)\(groupId)_\(deviceId)"
    if let clustersArray = UserDefaults.standard.array(forKey: key) as? [Int] {
      let serverClusters = clustersArray.map { UInt32($0) }
      if serverClusters.contains(RainMakerCluster.clusterId) {
        return (true, "0") // Endpoint 0
      }
    }
    return (false, nil)
  }
}

// MARK: - Matter Device Info Parsing

struct MatterDeviceInfo {
  let endpoints: [Endpoint]
  
  struct Endpoint {
    let id: UInt16
    let servers: [Cluster]
    let clients: [Cluster]
  }
  
  struct Cluster {
    let id: UInt32
    let name: String
    let attributes: [Attribute]
    let events: [Event]
  }
  
  struct Attribute {
    let id: UInt32
    let name: String
    let value: Any
  }
  
  struct Event {
    let id: UInt32
    let name: String
  }
}

@available(iOS 16.4, *)
extension ESPMatterModule {
  
  /// Parse matter device info
  /// - Parameter result: result
  /// - Returns: MatterDeviceInfo object
  static func parseDeviceInfo(from result: [[String: Any]]) -> MatterDeviceInfo {
    var endpointMap: [UInt16: (servers: [MatterDeviceInfo.Cluster], clients: [MatterDeviceInfo.Cluster])] = [:]
    
    for item in result {
      guard let attributePath = item["attributePath"] as? MTRAttributePath,
            let data = item["data"] as? [String: Any] else {
        continue
      }
      
      let endpoint = UInt16(attributePath.endpoint.uint32Value)
      let clusterId = attributePath.cluster.uint32Value
      let attributeId = attributePath.attribute.uint32Value
      
      // Initialize endpoint if not exists
      if endpointMap[endpoint] == nil {
        endpointMap[endpoint] = (servers: [], clients: [])
      }
      
      // Handle Descriptor cluster data (0x1d)
      if clusterId == 0x1d {
        switch attributeId {
        case 0x1: // ServerList
          if let serverData = data["value"] as? [[String: Any]] {
            let servers = serverData.compactMap { serverDict -> UInt32? in
              if let serverInfo = serverDict["data"] as? [String: Any],
                 let value = serverInfo["value"] as? NSNumber {
                return UInt32(value.uint32Value)
              }
              return nil
            }
            
            // Create empty clusters for servers
            endpointMap[endpoint]?.servers = servers.map { serverId in
              MatterDeviceInfo.Cluster(id: serverId,
                                       name: "Cluster 0x\(String(format: "%x", serverId))",
                                       attributes: [],
                                       events: [])
            }
          }
          
        case 0x2: // ClientList
          if let clientData = data["value"] as? [[String: Any]] {
            let clients = clientData.compactMap { clientDict -> UInt32? in
              if let clientInfo = clientDict["data"] as? [String: Any],
                 let value = clientInfo["value"] as? NSNumber {
                return UInt32(value.uint32Value)
              }
              return nil
            }
            
            // Create empty clusters for clients
            endpointMap[endpoint]?.clients = clients.map { clientId in
              MatterDeviceInfo.Cluster(id: clientId,
                                       name: "Cluster 0x\(String(format: "%x", clientId))",
                                       attributes: [],
                                       events: [])
            }
          }
        default:
          break
        }
      } else {
        // Handle attribute data for other clusters
        // Find the cluster in servers or clients and add the attribute
        let attribute = MatterDeviceInfo.Attribute(
          id: attributeId,
          name: "Attribute 0x\(String(format: "%x", attributeId))",
          value: data["value"] ?? "Unknown"
        )
        
        // Add attribute to appropriate cluster
        if var servers = endpointMap[endpoint]?.servers {
          if let index = servers.firstIndex(where: { $0.id == clusterId }) {
            var cluster = servers[index]
            var attributes = cluster.attributes
            attributes.append(attribute)
            cluster = MatterDeviceInfo.Cluster(id: cluster.id,
                                               name: cluster.name,
                                               attributes: attributes,
                                               events: cluster.events)
            servers[index] = cluster
            endpointMap[endpoint]?.servers = servers
          }
        }
      }
    }
    
    // Convert the map to array of endpoints
    let endpoints = endpointMap.map { (endpointId, clusterInfo) in
      MatterDeviceInfo.Endpoint(id: endpointId,
                                servers: clusterInfo.servers,
                                clients: clusterInfo.clients)
    }.sorted { $0.id < $1.id }
    
    return MatterDeviceInfo(endpoints: endpoints)
  }
  
  /// Convert MatterDeviceInfo to JSON format with endpoints organized by clusters
  /// - Parameter deviceInfo: MatterDeviceInfo object
  /// - Returns: Dictionary representation in the specified format
  static func convertToJSONFormat(from deviceInfo: MatterDeviceInfo) -> [String: Any] {
    var endpointsDict: [String: Any] = [:]
    
    for endpoint in deviceInfo.endpoints {
      let endpointKey = String(format: "0x%x", endpoint.id)
      var clustersDict: [String: Any] = [:]
      
      // Process servers
      if !endpoint.servers.isEmpty {
        var serversDict: [String: Any] = [:]
        for server in endpoint.servers {
          let clusterKey = String(format: "0x%x", server.id)
          let attributeIds = server.attributes.map { String(format: "0x%x", $0.id) }
          serversDict[clusterKey] = [ESPMatterConstants.attributes: attributeIds]
        }
        clustersDict[ESPMatterConstants.servers] = serversDict
      }
      
      // Process clients
      if !endpoint.clients.isEmpty {
        var clientsDict: [String: Any] = [:]
        for client in endpoint.clients {
          let clusterKey = String(format: "0x%x", client.id)
          let attributeIds = client.attributes.map { String(format: "0x%x", $0.id) }
          clientsDict[clusterKey] = [ESPMatterConstants.attributes: attributeIds]
        }
        clustersDict[ESPMatterConstants.clients] = clientsDict
      }
      
      endpointsDict[endpointKey] = [ESPMatterConstants.clusters: clustersDict]
    }
    
    return [ESPMatterConstants.endpoints: endpointsDict]
  }
}

// MARK: - RainMaker Cluster Operations

@available(iOS 16.4, *)
extension ESPMatterModule {
  
  /// Read RainMaker Node ID from device
  private func readRainMakerNodeId(deviceId: UInt64, completion: @escaping (String?) -> Void) {
    guard let controller = currentMatterController else {
      completion(nil)
      return
    }
    
    controller.getBaseDevice(deviceId, queue: matterQueue) { device, error in
      guard let device = device, error == nil else {
        completion(nil)
        return
      }
      
      let endpointId = NSNumber(value: 0)
      let clusterId = NSNumber(value: RainMakerCluster.clusterId)
      let attributeId = NSNumber(value: RainMakerCluster.Attributes.rainmakerNodeId)
      
      device.readAttributes(withEndpointID: endpointId,
                            clusterID: clusterId,
                            attributeID: attributeId,
                            params: nil,
                            queue: self.matterQueue) { values, error in
        
        guard let values = values, error == nil else {
          completion(nil)
          return
        }
        
        // Extract the node ID from the response
        for value in values {
          if let data = value[ESPMatterConstants.data] as? [String: Any],
             let nodeId = data[ESPMatterConstants.value] as? String {
            completion(nodeId)
            return
          }
        }
        
        completion(nil)
      }
    }
  }
  
  /// Send Matter Node ID to device
  private func sendMatterNodeIdToDevice(deviceId: UInt64, matterNodeId: String, completion: @escaping (Bool) -> Void) {
    guard let controller = currentMatterController else {
      completion(false)
      return
    }
    
    controller.getBaseDevice(deviceId, queue: matterQueue) { device, error in
      guard let device = device, error == nil else {
        completion(false)
        return
      }
      
      let endpointId = NSNumber(value: 0)
      let clusterId = NSNumber(value: RainMakerCluster.clusterId)
      let commandId = NSNumber(value: RainMakerCluster.Commands.sendNodeId)
      
      let commandFields: [String: Any] = [
        ESPMatterConstants.type: ESPMatterConstants.UTF8String,
        ESPMatterConstants.value: matterNodeId
      ]
      
      device.invokeCommand(withEndpointID: endpointId,
                           clusterID: clusterId,
                           commandID: commandId,
                           commandFields: commandFields,
                           timedInvokeTimeout: nil,
                           queue: self.matterQueue) { values, error in
        
        if let error = error {
          completion(false)
        } else {
          completion(true)
        }
      }
    }
  }
  
  /// Read challenge from device
  private func readChallengeFromDevice(deviceId: UInt64, completion: @escaping (String?) -> Void) {
    guard let controller = currentMatterController else {
      completion(nil)
      return
    }
    
    controller.getBaseDevice(deviceId, queue: matterQueue) { device, error in
      guard let device = device, error == nil else {
        completion(nil)
        return
      }
      
      let endpointId = NSNumber(value: 0)
      let clusterId = NSNumber(value: RainMakerCluster.clusterId)
      let attributeId = NSNumber(value: RainMakerCluster.Attributes.challenge)
      
      device.readAttributes(withEndpointID: endpointId,
                            clusterID: clusterId,
                            attributeID: attributeId,
                            params: nil,
                            queue: self.matterQueue) { values, error in
        
        guard let values = values, error == nil else {
          completion(nil)
          return
        }
        
        // Extract the challenge from the response
        for value in values {
          if let data = value[ESPMatterConstants.data] as? [String: Any],
             let challenge = data[ESPMatterConstants.value] as? String {
            completion(challenge)
            return
          }
        }
        
        completion(nil)
      }
    }
  }
  
  /// Confirm RainMaker commissioning with challenge
  private func confirmRainMakerCommissioning(deviceId: UInt64, groupId: String, rainmakerNodeId: String, challenge: String) {
    
    let deviceNameFromAppleCommissioning = ESPMatterEcosystemInfo.shared.getDeviceName()
    let deviceName = deviceNameFromAppleCommissioning ?? ESPMatterConstants.defaultDeviceName
    
    let matterNodeIdHex = String(format: ESPMatterConstants.matterNodeIdFormat, deviceId)
    let requestId = currentRequestId ?? String(deviceId)
    
    // Include device name in metadata for RainMaker devices
    let matterMetadata: [String: Any] = [
      ESPMatterConstants.isRainmakerNode: true,
      ESPMatterConstants.matterNodeIdKey: matterNodeIdHex,
      ESPMatterConstants.deviceName: deviceName
    ]
    
    let metadata: [String: Any] = [
      ESPMatterConstants.matter: matterMetadata
    ]
    
    let requestData: [String: Any] = [
      ESPMatterConstants.rainmakerNodeId: rainmakerNodeId,
      ESPMatterConstants.matterNodeId: matterNodeIdHex,
      ESPMatterConstants.challenge: challenge,
      ESPMatterConstants.challengeResponse: challenge,
      ESPMatterConstants.deviceId: requestId,
      ESPMatterConstants.requestId: requestId,
      ESPMatterConstants.deviceName: deviceName,
      ESPMatterConstants.metadata: metadata
    ]
    
    emitMatterEvent(eventType: ESPMatterConstants.commissioningConfirmationRequest, data: requestData)
  }
}

// MARK: - MTRDevicePairingDelegate Protocol
@available(iOS 16.4, *)
extension ESPMatterModule: MTRDevicePairingDelegate {
  
  /// On status updated
  func onStatusUpdate(_ status: MTRPairingStatus) {
    // Status updates can be logged for debugging
  }
  
  /// On pairing completed
  func onPairingComplete(_ error: Error?) {
    
    guard error == nil else {
      DispatchQueue.main.async {
        self.currentCommissioningReject?(ESPMatterConstants.pairingFailed,
                                         String(format: ESPMatterConstants.pairingFailedMsg, error!.localizedDescription),
                                         error)
      }
      return
    }
    
    // Continue with commissioning using device attestation delegate
    guard let controller = currentMatterController,
          let deviceId = currentDeviceId else {
      return
    }
    
    let params = MTRCommissioningParameters()
    params.deviceAttestationDelegate = self
    
    do {
      try controller.commissionNode(withID: NSNumber(value: deviceId), commissioningParams: params)
    } catch {
      DispatchQueue.main.async {
        self.currentCommissioningReject?(ESPMatterConstants.commissionNodeAfterPairingFailed,
                                         String(format: ESPMatterConstants.failedToStartCommissionNode, error.localizedDescription),
                                         error)
      }
    }
  }
  
  /// On pairing deleted callback
  func onPairingDeleted(_ error: Error?) {
  }
  
  /// On commissioning complete
  func onCommissioningComplete(_ error: Error?) {
    
    guard error == nil else {
      DispatchQueue.main.async {
        self.currentCommissioningReject?(ESPMatterConstants.commissioningFailedPairing,
                                         String(format: ESPMatterConstants.commissioningFailedPairingMsg, error!.localizedDescription),
                                         error)
      }
      return
    }
    
    // Perform post-commissioning actions
    performPostCommissioningActions()
  }
}

@available(iOS 16.4, *)
extension ESPMatterModule: MTRDeviceAttestationDelegate {
  
  /// Device attestation completed
  /// - Parameters:
  ///   - controller: controller
  ///   - opaqueDeviceHandle: opaque device handle
  ///   - attestationDeviceInfo: attestation device info
  ///   - error: error
  func deviceAttestationCompleted(for controller: MTRDeviceController, opaqueDeviceHandle: UnsafeMutableRawPointer, attestationDeviceInfo: MTRDeviceAttestationDeviceInfo, error: Error?) {
    do {
      try controller.continueCommissioningDevice(opaqueDeviceHandle, ignoreAttestationFailure: true)
    } catch {
    }
  }
  
  /// Device attestation failed
  /// - Parameters:
  ///   - controller: controller
  ///   - opaqueDeviceHandle: opaque device handle
  ///   - error: error
  func deviceAttestationFailed(for controller: MTRDeviceController, opaqueDeviceHandle: UnsafeMutableRawPointer, error: Error) {
    do {
      try controller.continueCommissioningDevice(opaqueDeviceHandle, ignoreAttestationFailure: true)
    } catch {
    }
  }
}

@available(iOS 16.4, *)
extension ESPMatterModule: MTRDeviceControllerDelegate {
  
  func controller(_ controller: MTRDeviceController, statusUpdate status: MTRCommissioningStatus) {
    
  }
  
  func controller(_ controller: MTRDeviceController, commissioningComplete error: Error?) {
    
    guard error == nil else {
      // Send commissioning failure event to React Native
      let failureEvent: [String: Any] = [
        ESPMatterConstants.eventType: ESPMatterConstants.commissioningComplete,
        ESPMatterConstants.success: false,
        ESPMatterConstants.error: error!.localizedDescription
      ]
      emitMatterEvent(eventType: ESPMatterConstants.commissioningComplete, data: failureEvent)
      return
    }
    
    // Perform post-commissioning actions immediately
    // The device is ready for cluster operations right after commissioning complete
    performPostCommissioningActionsImmediate()
  }
  
  func controller(_ : MTRDeviceController, commissioningSessionEstablishmentDone error: Error?) {
    guard let _ = error else {
      if let deviceId = currentDeviceId {
        let params = MTRCommissioningParameters()
        params.deviceAttestationDelegate = self
        if let controller = currentMatterController {
          do {
            try controller.commissionNode(withID: NSNumber(value: deviceId), commissioningParams: params)
          } catch {
          }
        }
      }
      return
    }
  }
  
}

// MARK: - MTROperationalCertificateIssuer Protocol

@available(iOS 16.4, *)
extension ESPMatterModule: MTROperationalCertificateIssuer {
  
  var shouldSkipAttestationCertificateValidation: Bool {
    return true // Skip attestation for development
  }
  
  func issueOperationalCertificate(forRequest csrInfo: MTROperationalCSRInfo,
                                   attestationInfo: MTRDeviceAttestationInfo,
                                   controller: MTRDeviceController,
                                   completion: @escaping (MTROperationalCertificateChain?, Error?) -> Void) {
    
    // Extract CSR from the request
    let csrData = csrInfo.csr
    let csrString = csrData.base64EncodedString()
    let csrPEM = "\(ESPMatterConstants.beginCertificateRequest)\n\(csrString)\n\(ESPMatterConstants.endCertificateRequest)"
    
    let groupId = currentFabricInfo?[ESPMatterConstants.id] as? String ?? ""
    let fabricId = currentFabricInfo?[ESPMatterConstants.fabricId] as? String ?? ""
    let deviceIdString = currentDeviceId?.description ?? ""
    
    var requestData: [String: Any] = [
      ESPMatterConstants.csr: csrPEM,
      ESPMatterConstants.groupId: groupId,
      ESPMatterConstants.fabricId: fabricId
    ]
    
    if !deviceIdString.isEmpty {
      requestData[ESPMatterConstants.deviceId] = deviceIdString
    }
    
    emitMatterEvent(eventType: ESPMatterConstants.nodeNocRequest, data: requestData)
    
    currentNOCCompletion = completion
  }
}

// MARK: - ESPMatterStorage Class

@available(iOS 16.4, *)
class ESPMatterStorage: NSObject, MTRStorage {
  func storageData(forKey key: String) -> Data? {
    return value(forKey: key)
  }
  
  func setStorageData(_ value: Data, forKey key: String) -> Bool {
    return setValue(value, forKey: key)
  }
  
  func removeStorageData(forKey key: String) -> Bool {
    return removeValue(forKey: key)
  }
  
  
  private let userDefaults = UserDefaults.standard
  private let storagePrefix = "ESPMatter_"
  
  func value(forKey key: String) -> Data? {
    return userDefaults.data(forKey: storagePrefix + key)
  }
  
  func setValue(_ value: Data?, forKey key: String) -> Bool {
    if let value = value {
      userDefaults.set(value, forKey: storagePrefix + key)
    } else {
      userDefaults.removeObject(forKey: storagePrefix + key)
    }
    return true
  }
  
  func removeValue(forKey key: String) -> Bool {
    userDefaults.removeObject(forKey: storagePrefix + key)
    return true
  }
}
