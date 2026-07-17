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

// MARK: - Data Hex Encoding (RMNG API expects hex, not base64)
public extension Data {
    var hexadecimalString: String {
        map { String(format: "%02hhX", $0) }.joined()
    }
}

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

  /// Match `ESPDiscoveryModule` / `ESPNotificationModule`: JS listens via
  /// `DeviceEventEmitter` (`ESPMatterControlAdapter.subscribe`) without calling
  /// native `addListener`. Without `disabledObservation`, `sendEvent` for
  /// `ESPMatter:attributeReport` is dropped and RN logs "no listeners registered".
  override init() {
    super.init(disabledObservation: ())
  }

  // MARK: - Properties
  private let csrQueue = DispatchQueue(label: ESPMatterConstants.csrQueueLabel, qos: .userInitiated)
  let matterQueue = DispatchQueue(label: ESPMatterConstants.matterQueueLabel, qos: .userInitiated)
  
  // Matter Event Identifier
  private let matterEventIdentifier: String = ESPMatterConstants.matterEventIdentifier
  
  // Store commissioning state
  private var currentFabricInfo: [String: Any]?
  private var currentCommissioningCompletion: RCTPromiseResolveBlock?
  private var currentCommissioningReject: RCTPromiseRejectBlock?
  
  // Matter controller and commissioning state
  var currentMatterController: MTRDeviceController?
  private var currentDeviceId: UInt64?
  private var currentMatterNodeId: UInt64?
  private var currentRequestId: String?
  private var currentNOCCompletion: ((MTROperationalCertificateChain?, Error?) -> Void)?
  
  // RMNG Matter commissioning state
  private var csrNonce: Data?
  private var rmngRequestId: String?
  private var attestationChallenge: Data?
  private var attestationSignature: Data?
  private var csrElementsTLV: Data?
  private var isRMNGWorkflow: Bool = false
  
  // RainMaker device properties
  private var rainmakerNodeId: String?
  private var isRainMakerDevice: Bool = false

  /// Most recently parsed Matter device info from the post-commissioning attribute scan.
  /// Used to populate the nested `endpoints` map in the cloud Matter metadata.
  private var lastParsedDeviceInfo: MatterDeviceInfo?
  
  // MARK: - RCTEventEmitter Override
  override func supportedEvents() -> [String]! {
    return [
      matterEventIdentifier,
      ESPMatterControl.attributeReportEventName
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

  /// Notifies React Native (DeviceEventEmitter) when commissioning fails, so UI can leave the loading state.
  /// Promise rejection alone may not reach screens that only listen for Matter events.
  private func emitCommissioningErrorToReactNative(message: String) {
    let data: [String: Any] = [
      ESPMatterConstants.errorMessage: message,
      ESPMatterConstants.success: false
    ]
    emitMatterEvent(eventType: ESPMatterConstants.commissioningError, data: data)
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
  /// For RMNG workflow, csrNonce and requestId should be provided
  @objc func startEcosystemCommissioning(_ onboardingPayload: String,
                                         fabric: [String: Any],
                                         resolver resolve: @escaping RCTPromiseResolveBlock,
                                         rejecter reject: @escaping RCTPromiseRejectBlock) {
    
    // Store commissioning state
    currentFabricInfo = fabric
    currentCommissioningCompletion = resolve
    currentCommissioningReject = reject
    
    // Check if RMNG workflow (has csrNonce and requestId)
    if let csrNonceHex = fabric[ESPMatterConstants.csrNonce] as? String,
       let requestId = fabric[ESPMatterConstants.requestId] as? String {
      csrNonce = dataFromHexString(csrNonceHex)
      rmngRequestId = requestId
      isRMNGWorkflow = true
      print("[MatterCommission] iOS: csrNonce from JS hex=\(csrNonceHex)")
    } else {
      isRMNGWorkflow = false
    }
    
    matterQueue.async {
      do {
        // Step 1: Apple Fabric Commissioning (using MatterSupport)
        try self.startAppleFabricCommissioning(qrData: onboardingPayload, fabric: fabric)
        // Note: Custom fabric commissioning will be triggered after Apple commissioning complete
      } catch {
        DispatchQueue.main.async {
          let msg = String(format: ESPMatterConstants.failedToStartCommissioning, error.localizedDescription)
          self.emitCommissioningErrorToReactNative(message: msg)
          reject(ESPMatterConstants.commissioningFailed, msg, error)
        }
      }
    }
  }
  
  /// Helper to convert hex string to Data
  func dataFromHexString(_ hex: String) -> Data? {
    var hex = hex
    if hex.hasPrefix("0x") || hex.hasPrefix("0X") {
      hex = String(hex.dropFirst(2))
    }

    guard hex.count % 2 == 0 else { return nil }

    var data = Data()
    var index = hex.startIndex

    while index < hex.endIndex {
      let next = hex.index(index, offsetBy: 2)
      let byteString = hex[index..<next]

      guard let byte = UInt8(byteString, radix: 16) else {
        return nil
      }

      data.append(byte)
      index = next
    }

    return data
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
    // Get the root CA certificate: first from fabricDetails, then fallback to keychain (precommission storage)
    let fabricId = currentFabricInfo?[ESPMatterConstants.fabricId] as? String ?? currentFabricInfo?[ESPMatterConstants.id] as? String ?? ""
    var rootCaString: String?
    if let fabricDetails = currentFabricInfo?[ESPMatterConstants.fabricDetails] as? [String: Any],
       let ca = (fabricDetails[ESPMatterConstants.rootCa] ?? fabricDetails["root_ca"]) as? String,
       !ca.isEmpty {
      rootCaString = ca
    }
    if (rootCaString == nil || rootCaString?.isEmpty == true) && !fabricId.isEmpty {
      let userNOCData = loadUserNOCFromKeychain(fabricId: fabricId)
      rootCaString = (userNOCData[ESPMatterConstants.rootCa] ?? userNOCData["root_ca"]) as? String
    }
    guard let rootCa = rootCaString, !rootCa.isEmpty,
          let rootCaDerData = convertPEMToDER(rootCa) else {
      let error = NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: ESPMatterConstants.failedToGetRootCa
      ])
      completion(nil, error)
      currentNOCCompletion = nil
      reject(ESPMatterConstants.rootCaNotFound, ESPMatterConstants.rootCaNotFoundMsg, error)
      return
    }
    
    // adminSubject = group_cat_id_admin (CAT ID) - required for CASE
    var adminSubject: NSNumber?
    if let fabricDetails = currentFabricInfo?[ESPMatterConstants.fabricDetails] as? [String: Any],
       let catIdAdminHex = (fabricDetails[ESPMatterConstants.groupCatIdAdmin] ?? fabricDetails["groupCatIdAdmin"]) as? String,
       !catIdAdminHex.isEmpty {
      let fullCatIdHex = ESPMatterConstants.prefixCATId + catIdAdminHex
      if let catIdDecimal = fullCatIdHex.hexToDecimal {
        adminSubject = NSNumber(value: catIdDecimal)
      }
    }
    
    let certificateChain = MTROperationalCertificateChain(
      operationalCertificate: nocDerData,
      intermediateCertificate: nil,
      rootCertificate: rootCaDerData,
      adminSubject: adminSubject
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

          let msg = String(format: ESPMatterConstants.appleCommissioningFailedMsg, error.localizedDescription)
          DispatchQueue.main.async {
            self.emitCommissioningErrorToReactNative(message: msg)
            self.currentCommissioningReject?(ESPMatterConstants.appleCommissioningFailed, msg, error)
            self.currentCommissioningCompletion = nil
            self.currentCommissioningReject = nil
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
  
  // MARK: - Post-login fabric bootstrap (cold start)

  /// Restores the Matter controller after login using fabric metadata + the Keychain-stored user NOC.
  ///
  /// iOS analogue of Android's `syncFabricSession`: hydrates `currentMatterController`
  /// before any `matterControlRead/Write/Invoke/Subscribe` calls can succeed.
  @objc(syncFabricSession:resolver:rejecter:)
  func syncFabricSession(_ params: [String: Any],
                         resolver resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
    do {
      if #available(iOS 16.4, *) {
        // ok
      } else {
        reject("UNSUPPORTED_IOS_VERSION", ESPMatterConstants.matterRequiresIOS164, nil)
        return
      }

      guard let groupId = params[ESPMatterConstants.groupId] as? String,
            !groupId.isEmpty,
            let fabricId = params[ESPMatterConstants.fabricId] as? String,
            !fabricId.isEmpty else {
        reject(ESPMatterConstants.invalidParams,
               "groupId and fabricId are required for syncFabricSession",
               nil)
        return
      }

      var fabric: [String: Any] = [
        ESPMatterConstants.id: groupId,
        ESPMatterConstants.fabricId: fabricId,
      ]

      if let name = params[ESPMatterConstants.name] as? String {
        fabric[ESPMatterConstants.name] = name
      }

      if let ipk = params[ESPMatterConstants.ipk] as? String, !ipk.isEmpty {
        fabric[ESPMatterConstants.fabricDetails] = [
          ESPMatterConstants.ipk: ipk,
        ]
      }

      try initializeMatterControllerWithFabric(fabric)
      resolve([ESPMatterConstants.success: true,
               ESPMatterConstants.message: "Matter controller restored for fabricId=\(fabricId) groupId=\(groupId)"])
    } catch let error as NSError {
      reject("SYNC_FABRIC_SESSION_ERROR", error.localizedDescription, error)
    } catch {
      reject("SYNC_FABRIC_SESSION_ERROR", "Failed to restore Matter controller", error)
    }
  }

  /// Check if user NOC exists in iOS Keychain for the given fabric
  /// - Parameter fabricId: Fabric ID used as the storage key (matches ESPMatterUtilityModule storage)
  private func checkUserNOCExists(fabricId: String) -> Bool {
    
    let account = "user_noc_\(fabricId)"
    let service = Bundle.bundleIdentifier()
    
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
    
    // Prefer the cloud-synced IPK so all controllers on this fabric agree on it.
    // Fall back to the locally generated IPK only if the cloud value is missing
    // or fails to decode (matches the production esp-rainmaker-ios behavior).
    var finalIPK = csrKeys.ipk
    if let fabricDetails = fabric[ESPMatterConstants.fabricDetails] as? [String: Any],
       let ipkHex = fabricDetails[ESPMatterConstants.ipk] as? String {
      let trimmedIpk = ipkHex.replacingOccurrences(of: " ", with: "")
      if !trimmedIpk.isEmpty, let cloudIPK = trimmedIpk.matterHexData {
        finalIPK = cloudIPK
      }
    }
    
    // Create Matter controller startup parameters
    let params = MTRDeviceControllerStartupParams(
      ipk: finalIPK,
      operationalKeypair: csrKeys,
      operationalCertificate: nocDerBytes,
      intermediateCertificate: nil,
      rootCertificate: rootCADerBytes
    )
    
    // Set vendor ID from configuration
    let vendorIdString = Bundle.configValue(for: "MATTER_VENDOR_ID")
    let vendorId = UInt16(strtoul(vendorIdString.replacingOccurrences(of: "0x", with: ""), nil, 16))
    params.vendorID = NSNumber(value: vendorId)
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
      self.lastParsedDeviceInfo = deviceInfo

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

    let matterMetadata = buildCloudMatterMetadata(
      deviceName: deviceName,
      isRainmaker: false,
      groupId: groupId
    )

    let metadata: [String: Any] = [
      ESPMatterConstants.matter: matterMetadata
    ]

    // Pure Matter confirm needs `matterNodeId` for the Matter SDK's
    // startCommissioning event handler validation; rainmakerNodeId / challenge
    // are intentionally omitted (cloud `confirmPureMatterNode` does not require them).
    let matterNodeIdHex = String(format: ESPMatterConstants.matterNodeIdFormat, deviceId)
    let requestId = currentRequestId ?? String(deviceId)

    let requestData: [String: Any] = [
      ESPMatterConstants.requestId: requestId,
      ESPMatterConstants.status: ESPMatterConstants.success,
      ESPMatterConstants.deviceName: deviceName,
      ESPMatterConstants.matterNodeId: matterNodeIdHex,
      ESPMatterConstants.deviceId: requestId,
      ESPMatterConstants.metadata: metadata
    ]

    emitMatterEvent(eventType: ESPMatterConstants.commissioningConfirmationRequest, data: requestData)
  }

  /// Builds the canonical cloud Matter metadata payload (the `Matter` sub-object
  /// inside `metadata`), aligned with reference iOS / reference Android apps and
  /// the matter SDK's `ESPRMMatterMetadataInterface`.
  ///
  /// Shape:
  /// ```
  /// {
  ///   "deviceName": "...",
  ///   "isRainmaker": <bool>,
  ///   "group_id": "...",
  ///   "endpoints": {
  ///     "0x<EP>": {
  ///       "deviceType": [<int>...],
  ///       "clusters": { "servers": {...}, "clients": {...} }
  ///     }
  ///   }
  /// }
  /// ```
  /// `matterNodeId` is intentionally NOT included here — it is sent in the outer body.
  private func buildCloudMatterMetadata(
    deviceName: String,
    isRainmaker: Bool,
    groupId: String
  ) -> [String: Any] {
    var matterMetadata: [String: Any] = [
      ESPMatterConstants.deviceName: deviceName,
      ESPMatterConstants.isRainmaker: isRainmaker,
      ESPMatterConstants.groupIdKeyDict: groupId
    ]

    if let deviceInfo = self.lastParsedDeviceInfo {
      let endpointsDict = ESPMatterModule.buildEndpointsDict(from: deviceInfo)
      if !endpointsDict.isEmpty {
        matterMetadata[ESPMatterConstants.endpoints] = endpointsDict
      }
    }

    logMatterDeviceDataModel(matterMetadata)
    return matterMetadata
  }

  /// Logs the complete Matter device data model as pretty-printed JSON after successful commissioning.
  private func logMatterDeviceDataModel(_ metadata: [String: Any]) {
    do {
      let data = try JSONSerialization.data(
        withJSONObject: metadata,
        options: [.prettyPrinted, .sortedKeys]
      )
      guard let json = String(data: data, encoding: .utf8) else {
        NSLog("[ESPMatterModule] Failed to encode Matter device data model for logging")
        return
      }
      NSLog("[ESPMatterModule] Complete Matter device data model (post-commissioning):\n%@", json)
    } catch {
      NSLog(
        "[ESPMatterModule] Failed to serialize Matter device data model for logging: %@",
        error.localizedDescription
      )
    }
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

  /// Returns the first Matter device type id from the first non-zero endpoint
  /// that exposes a DeviceTypeList. Endpoint 0 is the Root Node and is excluded.
  /// Used for default device naming during commissioning.
  var primaryDeviceType: UInt32? {
    for endpoint in endpoints where endpoint.id != 0 {
      if let firstType = endpoint.deviceTypes.first {
        return firstType
      }
    }
    return nil
  }

  struct Endpoint {
    let id: UInt16
    let servers: [Cluster]
    let clients: [Cluster]
    let deviceTypes: [UInt32]
  }
  
  struct Cluster {
    let id: UInt32
    let name: String
    let attributes: [Attribute]
    let events: [Event]
    let acceptedCommands: [UInt32]
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

  /// Parses a Matter global list attribute value (e.g. AttributeList / AcceptedCommandList).
  private static func parseMatterIdList(from data: [String: Any]) -> [UInt32] {
    guard let value = data["value"] else { return [] }
    if let numbers = value as? [NSNumber] {
      return numbers.map { UInt32($0.uint32Value) }
    }
    if let entries = value as? [[String: Any]] {
      return entries.compactMap { entry -> UInt32? in
        if let inner = entry["data"] as? [String: Any],
           let number = inner["value"] as? NSNumber {
          return UInt32(number.uint32Value)
        }
        if let number = entry["value"] as? NSNumber {
          return UInt32(number.uint32Value)
        }
        return nil
      }
    }
    return []
  }
  
  /// Parse matter device info
  /// - Parameter result: result
  /// - Returns: MatterDeviceInfo object
  static func parseDeviceInfo(from result: [[String: Any]]) -> MatterDeviceInfo {
    var endpointMap: [UInt16: (servers: [MatterDeviceInfo.Cluster], clients: [MatterDeviceInfo.Cluster], deviceTypes: [UInt32])] = [:]

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
        endpointMap[endpoint] = (servers: [], clients: [], deviceTypes: [])
      }
      
      // Handle Descriptor cluster data (0x1d)
      if clusterId == 0x1d {
        switch attributeId {
        case 0x0: // DeviceTypeList — array of structs { deviceType, revision }
          if let typeData = data["value"] as? [[String: Any]] {
            let types = typeData.compactMap { entryDict -> UInt32? in
              guard let entryStruct = entryDict["data"] as? [String: Any],
                    let fields = entryStruct["value"] as? [[String: Any]] else {
                return nil
              }
              for field in fields {
                if let context = field["contextTag"] as? NSNumber,
                   context.uint32Value == 0,
                   let inner = field["data"] as? [String: Any],
                   let value = inner["value"] as? NSNumber {
                  return UInt32(value.uint32Value)
                }
              }
              return nil
            }
            endpointMap[endpoint]?.deviceTypes = types
          }

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
                                       events: [],
                                       acceptedCommands: [])
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
                                       events: [],
                                       acceptedCommands: [])
            }
          }
        default:
          break
        }
      } else if attributeId == 0xFFF9 {
        let acceptedCommands = parseMatterIdList(from: data)
        if var servers = endpointMap[endpoint]?.servers,
           let index = servers.firstIndex(where: { $0.id == clusterId }) {
          let cluster = servers[index]
          servers[index] = MatterDeviceInfo.Cluster(id: cluster.id,
                                                    name: cluster.name,
                                                    attributes: cluster.attributes,
                                                    events: cluster.events,
                                                    acceptedCommands: acceptedCommands)
          endpointMap[endpoint]?.servers = servers
        }
      } else if attributeId != 0xFFFB {
        // Handle attribute data for other clusters
        let attribute = MatterDeviceInfo.Attribute(
          id: attributeId,
          name: "Attribute 0x\(String(format: "%x", attributeId))",
          value: data["value"] ?? "Unknown"
        )

        if var servers = endpointMap[endpoint]?.servers {
          if let index = servers.firstIndex(where: { $0.id == clusterId }) {
            var cluster = servers[index]
            var attributes = cluster.attributes
            attributes.append(attribute)
            cluster = MatterDeviceInfo.Cluster(id: cluster.id,
                                               name: cluster.name,
                                               attributes: attributes,
                                               events: cluster.events,
                                               acceptedCommands: cluster.acceptedCommands)
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
                                clients: clusterInfo.clients,
                                deviceTypes: clusterInfo.deviceTypes)
    }.sorted { $0.id < $1.id }
    
    return MatterDeviceInfo(endpoints: endpoints)
  }
  
  /// Build the inner `endpoints` map for cloud Matter metadata, organized by clusters.
  /// Shape: `{ "0x<EP>": { "deviceType": [<int>...], "clusters": { "servers": { "0x<CID>": { "attributes": [...], "accepted_commands": [...] } }, "clients": {...} } } }`
  /// matches reference iOS / reference Android.
  static func buildEndpointsDict(from deviceInfo: MatterDeviceInfo) -> [String: Any] {
    var endpointsDict: [String: Any] = [:]

    for endpoint in deviceInfo.endpoints {
      let endpointKey = String(format: "0x%x", endpoint.id)
      var clustersDict: [String: Any] = [:]

      if !endpoint.servers.isEmpty {
        var serversDict: [String: Any] = [:]
        for server in endpoint.servers {
          let clusterKey = String(format: "0x%x", server.id)
          let attributeIds = server.attributes
            .filter { $0.id != 0xFFFB && $0.id != 0xFFF9 }
            .map { String(format: "0x%x", $0.id) }
          var clusterDict: [String: Any] = [
            ESPMatterConstants.attributes: attributeIds.isEmpty ? NSNull() : attributeIds
          ]
          let commandIds = server.acceptedCommands.map { String(format: "0x%x", $0) }
          clusterDict[ESPMatterConstants.acceptedCommands] =
            commandIds.isEmpty ? NSNull() : commandIds
          serversDict[clusterKey] = clusterDict
        }
        clustersDict[ESPMatterConstants.servers] = serversDict
      }

      if !endpoint.clients.isEmpty {
        var clientsDict: [String: Any] = [:]
        for client in endpoint.clients {
          let clusterKey = String(format: "0x%x", client.id)
          clientsDict[clusterKey] = [ESPMatterConstants.attributes: NSNull()]
        }
        clustersDict[ESPMatterConstants.clients] = clientsDict
      }

      var endpointDict: [String: Any] = [
        ESPMatterConstants.clusters: clustersDict,
        ESPMatterConstants.deviceType: endpoint.deviceTypes.map { Int($0) }
      ]
      endpointsDict[endpointKey] = endpointDict
    }

    return endpointsDict
  }

  /// Wrapper kept for local UserDefaults storage (`{ "endpoints": {...} }`).
  static func convertToJSONFormat(from deviceInfo: MatterDeviceInfo) -> [String: Any] {
    return [ESPMatterConstants.endpoints: buildEndpointsDict(from: deviceInfo)]
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

    let matterMetadata = buildCloudMatterMetadata(
      deviceName: deviceName,
      isRainmaker: true,
      groupId: groupId
    )

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
        let msg = String(format: ESPMatterConstants.pairingFailedMsg, error!.localizedDescription)
        self.emitCommissioningErrorToReactNative(message: msg)
        self.currentCommissioningReject?(ESPMatterConstants.pairingFailed,
                                         msg,
                                         error)
        self.currentCommissioningCompletion = nil
        self.currentCommissioningReject = nil
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
    
    // Set CSR nonce for RMNG workflow
    if let csrNonce = csrNonce {
      params.csrNonce = csrNonce
      print("[MatterCommission] iOS: CSR Nonce being sent to device (onPairingComplete): \(csrNonce.hexadecimalString)")
    } else {
      print("[MatterCommission] iOS: WARNING - csrNonce is nil in onPairingComplete")
    }
    let nonceInParams = params.csrNonce?.hexadecimalString ?? "nil"
    print("[MatterCommission] iOS: commissionNode called (onPairingComplete) deviceId=\(deviceId), params.csrNonce=\(nonceInParams)")
    do {
      try controller.commissionNode(withID: NSNumber(value: deviceId), commissioningParams: params)
    } catch {
      DispatchQueue.main.async {
        let msg = String(format: ESPMatterConstants.failedToStartCommissionNode, error.localizedDescription)
        self.emitCommissioningErrorToReactNative(message: msg)
        self.currentCommissioningReject?(ESPMatterConstants.commissionNodeAfterPairingFailed,
                                         msg,
                                         error)
        self.currentCommissioningCompletion = nil
        self.currentCommissioningReject = nil
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
        let msg = String(format: ESPMatterConstants.commissioningFailedPairingMsg, error!.localizedDescription)
        self.emitCommissioningErrorToReactNative(message: msg)
        self.currentCommissioningReject?(ESPMatterConstants.commissioningFailedPairing,
                                         msg,
                                         error)
        self.currentCommissioningCompletion = nil
        self.currentCommissioningReject = nil
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
    // Extract attestationChallenge for RMNG workflow
    if isRMNGWorkflow {
      if #available(iOS 26.1, *) {
        attestationChallenge = attestationDeviceInfo.attestationChallenge
      }
      print("[MatterCommission] iOS: deviceAttestationCompleted, attestationChallenge=\(attestationChallenge != nil ? "present" : "nil (iOS<26.1?)")")
      if let challenge = attestationChallenge {
        print("[MatterCommission] iOS: emitting RMNG_ATTESTATION_CHALLENGE event")
        emitMatterEvent(eventType: ESPMatterConstants.rmngAttestationChallenge, data: [
          ESPMatterConstants.attestationChallenge: challenge.hexadecimalString,
          ESPMatterConstants.requestId: rmngRequestId ?? ""
        ])
      } else {
        print("[MatterCommission] iOS: attestationChallenge is nil, NOT emitting RMNG_ATTESTATION_CHALLENGE")
      }
    }
    
    print("[MatterCommission] iOS: continueCommissioning called (deviceAttestationCompleted)")
    do {
      try controller.continueCommissioningDevice(opaqueDeviceHandle, ignoreAttestationFailure: true)
    } catch {
      print("[MatterCommission] iOS: continueCommissioning error: \(error)")
    }
  }
  
  /// Device attestation failed
  /// - Parameters:
  ///   - controller: controller
  ///   - opaqueDeviceHandle: opaque device handle
  ///   - error: error
  func deviceAttestationFailed(for controller: MTRDeviceController, opaqueDeviceHandle: UnsafeMutableRawPointer, error: Error) {
    print("[MatterCommission] iOS: continueCommissioning called (deviceAttestationFailed)")
    do {
      try controller.continueCommissioningDevice(opaqueDeviceHandle, ignoreAttestationFailure: true)
    } catch {
      print("[MatterCommission] iOS: continueCommissioning error: \(error)")
    }
  }
}

@available(iOS 16.4, *)
extension ESPMatterModule: MTRDeviceControllerDelegate {
  
  func controller(_ controller: MTRDeviceController, statusUpdate status: MTRCommissioningStatus) {
    
  }
  
  func controller(_ controller: MTRDeviceController, commissioningComplete error: Error?) {
    
    guard error == nil else {
      let err = error!
      let failureEvent: [String: Any] = [
        ESPMatterConstants.eventType: ESPMatterConstants.commissioningComplete,
        ESPMatterConstants.success: false,
        ESPMatterConstants.error: err.localizedDescription
      ]
      let msg = String(format: ESPMatterConstants.commissioningFailedPairingMsg, err.localizedDescription)
      DispatchQueue.main.async {
        self.emitMatterEvent(eventType: ESPMatterConstants.commissioningComplete, data: failureEvent)
        self.currentCommissioningReject?(ESPMatterConstants.commissioningFailedPairing, msg, err)
        self.currentCommissioningCompletion = nil
        self.currentCommissioningReject = nil
      }
      return
    }
    
    // Perform post-commissioning actions immediately
    // The device is ready for cluster operations right after commissioning complete
    performPostCommissioningActionsImmediate()
  }
  
  func controller(_ : MTRDeviceController, commissioningSessionEstablishmentDone error: Error?) {
    if let error = error {
      let msg = String(format: ESPMatterConstants.failedToSetupSession, error.localizedDescription)
      DispatchQueue.main.async {
        self.emitCommissioningErrorToReactNative(message: msg)
        self.currentCommissioningReject?(ESPMatterConstants.commissioningFailed, msg, error)
        self.currentCommissioningCompletion = nil
        self.currentCommissioningReject = nil
      }
      shutdownMatterController()
      return
    }
    if let deviceId = currentDeviceId {
      let params = MTRCommissioningParameters()
      params.deviceAttestationDelegate = self
      if let csrNonce = csrNonce {
        params.csrNonce = csrNonce
        print("[MatterCommission] iOS: CSR Nonce being sent to device: \(csrNonce.hexadecimalString)")
      } else {
        print("[MatterCommission] iOS: WARNING - csrNonce is nil, commissionNode will NOT use our getCSRNonce challenge")
      }
      if let controller = currentMatterController {
        do {
          let nonceInParams = params.csrNonce?.hexadecimalString ?? "nil"
          print("[MatterCommission] iOS: commissionNode called with deviceId=\(deviceId), params.csrNonce=\(nonceInParams)")
          try controller.commissionNode(withID: NSNumber(value: deviceId), commissioningParams: params)
        } catch {
          DispatchQueue.main.async {
            let failMsg = String(format: ESPMatterConstants.failedToStartCommissionNode, error.localizedDescription)
            self.emitCommissioningErrorToReactNative(message: failMsg)
            self.currentCommissioningReject?(ESPMatterConstants.commissionNodeAfterPairingFailed, failMsg, error)
            self.currentCommissioningCompletion = nil
            self.currentCommissioningReject = nil
          }
        }
      }
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
    
    if isRMNGWorkflow {
      let deviceCSRNonce = csrInfo.csrNonce.hexadecimalString
      let ourExpectedNonce = csrNonce?.hexadecimalString ?? "nil"
      print("[MatterCommission] iOS: CSRNonce mismatch check: ourNonce(from getCSRNonce)=\(ourExpectedNonce) vs deviceReturned=\(deviceCSRNonce)")
      attestationSignature = csrInfo.attestationSignature
      csrElementsTLV = csrInfo.csrElementsTLV
      
      var rmngData: [String: Any] = [
        ESPMatterConstants.requestId: rmngRequestId ?? "",
        ESPMatterConstants.attestationSignature: attestationSignature?.hexadecimalString ?? "",
        ESPMatterConstants.nocsrElements: csrElementsTLV?.hexadecimalString ?? "",
      ]
      
      if attestationChallenge == nil {
        attestationChallenge = attestationInfo.challenge
        if let challenge = attestationChallenge {
          rmngData[ESPMatterConstants.attestationChallenge] = challenge.hexadecimalString
        }
      }
      print("[MatterCommission] iOS: emitting RMNG_MATTER_ATTESTATION_DATA")
      emitMatterEvent(eventType: ESPMatterConstants.rmngMatterAttestationData, data: rmngData)
      
      currentNOCCompletion = completion
    } else {
      // Legacy RM workflow: Extract CSR and emit NOC request event
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

// MARK: - Hex Decoding

fileprivate extension String {
  /// Decodes a hexadecimal string (e.g. an IPK delivered from the cloud) into raw bytes.
  /// Returns `nil` for empty input or strings that don't contain valid hex pairs.
  /// Mirrors the helper used by the production esp-rainmaker-ios app.
  var matterHexData: Data? {
    var data = Data(capacity: self.count / 2)
    guard let regex = try? NSRegularExpression(pattern: "[0-9a-f]{1,2}", options: .caseInsensitive) else {
      return nil
    }
    regex.enumerateMatches(in: self, range: NSRange(startIndex..., in: self)) { match, _, _ in
      guard let match = match else { return }
      let byteString = (self as NSString).substring(with: match.range)
      if let num = UInt8(byteString, radix: 16) {
        data.append(num)
      }
    }
    return data.isEmpty ? nil : data
  }
}
