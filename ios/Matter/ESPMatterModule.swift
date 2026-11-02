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

// MARK: - Data Hex Encoding
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
  private var activeControllerFabricId: String?
  private var currentDeviceId: UInt64?
  private var currentMatterNodeId: UInt64?
  private var currentRequestId: String?
  private var currentNOCCompletion: ((MTROperationalCertificateChain?, Error?) -> Void)?

  /// A deployment that pre-issues its CSR nonce hands it over on the fabric object,
  /// and it must be bound into the device's CSRRequest or the verify step
  /// rejects the NOC. Neo does this via `/initiate`; classic RainMaker sends no nonce
  /// and lets the stack generate one. The presence of the nonce is the only signal
  /// needed, so any future deployment that pre-issues one works without a code change.
  private var currentCsrNonce: Data?
  private var isNonceBoundSession: Bool { currentCsrNonce != nil }

  /// On iOS 26.2+ the nonce-bound path drives an MTRCommissioningOperation while this
  /// object is still the controller's delegate. Apple only documents attestation being
  /// redirected to MTRCommissioningDelegate, so one commissioning can report its
  /// outcome twice, once per delegate. Acting on both would append the operate-CAT ACL
  /// entry a second time and emit a second confirmation request whose terminal event
  /// carries the ids the first pass already cleared. Both delegates are bound to the
  /// same serial `matterQueue`, so a plain flag is enough.
  private var didFireCommissioningOutcome = false

  /// Bumped on every start and cancel, so work from a cancelled session (e.g. Apple's
  /// sheet returning late) can tell it no longer owns the session.
  private var commissioningSessionId = 0

  /// The in-flight MTRCommissioningOperation on the iOS 26.2+ Neo path (type-erased
  /// because stored properties cannot be availability-gated). On iOS 26.2+ the legacy
  /// setupCommissioningSession → commissionNode split runs on an internally-created
  /// operation whose parameters are fixed at creation, so a csrNonce supplied later
  /// via commissionNode never reaches the CSRRequest — Neo sessions must instead
  /// create the operation themselves with the nonce already in the parameters.
  private var currentCommissioningOperation: AnyObject?

  // RainMaker device properties
  private var rainmakerNodeId: String?
  private var isRainMakerDevice: Bool = false

  /// Most recently parsed Matter device info from the post-commissioning attribute scan.
  /// Used to populate the nested `endpoints` map in the Matter metadata.
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

  /// Starts the native commissioning process for a Matter device.
  ///
  /// - Parameters:
  ///   - onboardingPayload: QR code or manual pairing payload scanned from the device.
  ///   - fabric: Active fabric details. A `csrNonce` here selects the nonce-bound path
  ///     (see `isNonceBoundSession`); its absence lets the stack generate its own.
  ///   - resolve: Called when commissioning has been handed off to the Matter stack.
  ///   - reject: Called when the payload or fabric details are invalid, or the
  ///     controller cannot be started.
  @objc func startEcosystemCommissioning(_ onboardingPayload: String,
                                         fabric: [String: Any],
                                         resolver resolve: @escaping RCTPromiseResolveBlock,
                                         rejecter reject: @escaping RCTPromiseRejectBlock) {

    // One session at a time: a second start must not wipe the one in flight.
    if currentFabricInfo != nil {
      reject(ESPMatterConstants.commissioningInProgress, ESPMatterConstants.commissioningInProgressMsg, nil)
      return
    }
    clearCommissioningSessionState()
    commissioningSessionId += 1
    let sessionId = commissioningSessionId

    // Store commissioning state
    currentFabricInfo = fabric
    currentCommissioningCompletion = resolve
    currentCommissioningReject = reject

    // RMNeo detection (I1): the Neo SDK sets the `/initiate` challenge as `csrNonce`
    // on the fabric object. Malformed input fails fast — commissioning with a random
    // nonce would only surface later as a /verify 400.
    if let csrNonceHex = fabric[ESPMatterConstants.csrNonce] as? String, !csrNonceHex.isEmpty {
      guard csrNonceHex.count == 64, let nonce = csrNonceHex.matterHexData, nonce.count == 32 else {
        let msg = ESPMatterConstants.invalidCsrNonceMsg
        emitCommissioningErrorToReactNative(message: msg)
        clearCommissioningSessionState()
        reject(ESPMatterConstants.invalidParams, msg, nil)
        return
      }
      currentCsrNonce = nonce
    }
    // Neo also seeds the `requestId` here so the confirmation request can be
    // built even if the NOC response never echoes it back.
    if let requestId = fabric[ESPMatterConstants.requestId] as? String, !requestId.isEmpty {
      currentRequestId = requestId
    }
    matterQueue.async {
      do {
        // Step 1: Apple Fabric Commissioning (using MatterSupport)
        try self.startAppleFabricCommissioning(qrData: onboardingPayload, fabric: fabric, sessionId: sessionId)
        // Hand-off done: the outcome arrives as events, matching Android's start promise.
        DispatchQueue.main.async {
          self.resolveCommissioningStart()
        }
      } catch {
        DispatchQueue.main.async {
          let msg = String(format: ESPMatterConstants.failedToStartCommissioning, error.localizedDescription)
          self.emitCommissioningErrorToReactNative(message: msg)
          self.rejectCommissioningStart(ESPMatterConstants.commissioningFailed, msg, error)
          self.clearCommissioningSessionState()
        }
      }
    }
  }

  // MARK: - Cancel

  /// Ends the current commissioning session, if any, so the next add can start.
  /// JS calls it when an add fails or the user leaves before it finished. Safe to
  /// call when nothing is running.
  ///
  /// - Parameters:
  ///   - resolve: Called with `cancelled: true` when a session was ended.
  @objc func cancelCommissioning(_ resolve: @escaping RCTPromiseResolveBlock,
                                 rejecter _: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      let wasRunning = self.currentFabricInfo != nil
      if wasRunning {
        self.commissioningSessionId += 1
        let error = NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
          NSLocalizedDescriptionKey: ESPMatterConstants.commissioningCancelledMsg
        ])
        self.currentNOCCompletion?(nil, error)
        self.rejectCommissioningStart(ESPMatterConstants.commissioningCancelled,
                                      ESPMatterConstants.commissioningCancelledMsg, error)
        self.endCommissioningSession()
      }
      resolve([ESPMatterConstants.cancelled: wasRunning])
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

      // RMNeo /verify failures arrive as {status:"failed", errorMessage/description}.
      if let status = data[ESPMatterConstants.status] as? String {
        nocResponse[ESPMatterConstants.status] = status
      }
      if let errorMessage = (data[ESPMatterConstants.errorMessage]
                             ?? data[ESPMatterConstants.descriptionKey]) as? String {
        nocResponse[ESPMatterConstants.errorMessage] = errorMessage
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

  /// Answers the pending `issueOperationalCertificate` request with the issued
  /// NOC, or fails it with the issuer's error.
  ///
  /// - Parameters:
  ///   - nocResponse: `nodeNoc` (PEM) and `matterNodeId` (hex), optionally `requestId`;
  ///     or `status: "failed"` with an `errorMessage` when issuance failed upstream.
  ///   - resolve: Called once the certificate chain, or the failure, has been handed to CHIP.
  ///   - reject: Called when no issuance is pending or the response cannot be turned
  ///     into a certificate chain.
  @objc func sendNocResponse(_ nocResponse: [String: Any],
                             resolver resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {

    guard let completion = currentNOCCompletion else {
      reject(ESPMatterConstants.noCompletionHandler, ESPMatterConstants.noNocCompletionHandler, nil)
      return
    }

    // Upstream NOC issuance failure (I4, RMNeo /verify): fail the CHIP NOC flow
    // with the returned message instead of the generic missing-data error, and let
    // the UI leave its loading state via COMMISSIONING_ERROR.
    if let status = nocResponse[ESPMatterConstants.status] as? String,
       status == ESPMatterConstants.failedStatus {
      let message = nocResponse[ESPMatterConstants.errorMessage] as? String
        ?? ESPMatterConstants.nodeNocIssuanceFailedMsg
      let error = NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: message
      ])
      completion(nil, error)
      currentNOCCompletion = nil
      emitCommissioningErrorToReactNative(message: message)
      // Terminal for this add: free the session now rather than wait for a callback.
      endCommissioningSession()
      resolve([ESPMatterConstants.success: false, ESPMatterConstants.message: message])
      return
    }

    guard let nodeNoc = nocResponse[ESPMatterConstants.nodeNoc] as? String,
          let matterNodeId = nocResponse[ESPMatterConstants.matterNodeId] as? String else {
      failNocIssuance(completion,
                      code: ESPMatterConstants.invalidNocResponse,
                      message: ESPMatterConstants.missingRequiredNocData,
                      rejecter: reject)
      return
    }

    if let requestId = nocResponse[ESPMatterConstants.requestId] as? String {
      currentRequestId = requestId
    }
    if let matterNodeIdUInt64 = UInt64(matterNodeId, radix: 16) {
      currentMatterNodeId = matterNodeIdUInt64
    }

    guard let nocDerData = convertPEMToDER(nodeNoc) else {
      failNocIssuance(completion,
                      code: ESPMatterConstants.nocConversionFailed,
                      message: ESPMatterConstants.failedToConvertNoc,
                      rejecter: reject)
      return
    }

    guard let rootCaDerData = resolveRootCaDer() else {
      failNocIssuance(completion,
                      code: ESPMatterConstants.rootCaNotFound,
                      message: ESPMatterConstants.failedToGetRootCa,
                      rejectMessage: ESPMatterConstants.rootCaNotFoundMsg,
                      rejecter: reject)
      return
    }

    let certificateChain = MTROperationalCertificateChain(
      operationalCertificate: nocDerData,
      intermediateCertificate: nil,
      rootCertificate: rootCaDerData,
      adminSubject: resolveAdminSubject()
    )

    completion(certificateChain, nil)
    currentNOCCompletion = nil
    resolve([ESPMatterConstants.success: true, ESPMatterConstants.message: ESPMatterConstants.nocResponseProcessed])
  }

  /// Forwards the confirmation response to the device and ends the session.
  ///
  /// - Parameters:
  ///   - confirmResponse: Confirmation payload returned by the confirm step.
  ///   - resolve: Called once the response has been applied and session state cleared.
  ///   - reject: Called when no commissioning session is in flight or the payload is invalid.
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
    // The Neo SDK's confirmation response carries only {status, deviceName}; fall
    // back to what this module learned during the EP0 probe so the terminal event
    // still reports hybrid identity (the app's timezone push keys off it).
    let rainmakerNodeIdFromResponse = confirmResponse[ESPMatterConstants.rainmakerNodeId] as? String ?? ""
    let rainmakerNodeId = rainmakerNodeIdFromResponse.isEmpty
      ? (self.rainmakerNodeId ?? "")
      : rainmakerNodeIdFromResponse
    let matterNodeIdFromResponse = confirmResponse[ESPMatterConstants.matterNodeIdKey] as? String ?? ""
    let matterNodeId: String
    if !matterNodeIdFromResponse.isEmpty {
      matterNodeId = matterNodeIdFromResponse
    } else if let currentMatterNodeId = currentMatterNodeId {
      matterNodeId = String(format: ESPMatterConstants.matterNodeIdFormat, currentMatterNodeId)
    } else {
      matterNodeId = ""
    }
    let isRainmakerNode = confirmResponse[ESPMatterConstants.isRainmakerNode] as? Bool
      ?? isRainMakerDevice
    // Node id from the association step, supplied by the SDK. Unlike rainmakerNodeId this is
    // not read off cluster 0x131bfc00, so it survives mirror-style hybrids that
    // expose no RainMaker cluster — which is what the app's timezone push needs.
    let rmNeoNodeId = confirmResponse[ESPMatterConstants.rmNeoNodeId] as? String ?? ""

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
      ESPMatterConstants.rmNeoNodeId: rmNeoNodeId,
      ESPMatterConstants.matterNodeId: matterNodeId
    ]

    emitMatterEvent(eventType: ESPMatterConstants.commissioningComplete, data: commissioningCompleteEvent)

    clearCommissioningSessionState()

    resolve([ESPMatterConstants.success: true, ESPMatterConstants.message: ESPMatterConstants.confirmationResponseSent])
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
}

// MARK: - Session State and Events

@available(iOS 16.4, *)
extension ESPMatterModule {

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

  /// Settles the start promise once; after hand-off, failures reach JS as events only.
  private func resolveCommissioningStart() {
    currentCommissioningCompletion?([
      ESPMatterConstants.success: true,
      ESPMatterConstants.message: ESPMatterConstants.commissioningStartedMsg
    ])
    currentCommissioningCompletion = nil
    currentCommissioningReject = nil
  }

  private func rejectCommissioningStart(_ code: String, _ message: String, _ error: Error?) {
    currentCommissioningReject?(code, message, error)
    currentCommissioningCompletion = nil
    currentCommissioningReject = nil
  }

  /// Clears all per-session commissioning state. Called on terminal completion
  /// (`sendConfirmResponse`) and every terminal failure path so a stale Neo
  /// `csrNonce`/`requestId` can never leak into the next session.
  private func clearCommissioningSessionState() {
    currentCommissioningCompletion = nil
    currentCommissioningReject = nil
    currentFabricInfo = nil
    currentDeviceId = nil
    currentMatterNodeId = nil
    currentRequestId = nil
    currentCsrNonce = nil
    currentNOCCompletion = nil
    currentCommissioningOperation = nil
    rainmakerNodeId = nil
    isRainMakerDevice = false
    didFireCommissioningOutcome = false
  }

  /// Stops whatever commissioning is in flight and clears the session. The stopped
  /// work's late failure callback is then ignored instead of reported a second time.
  private func endCommissioningSession() {
    if #available(iOS 26.2, *),
       let operation = currentCommissioningOperation as? MTRCommissioningOperation {
      _ = operation.stop()
    } else if let deviceId = currentDeviceId, let controller = currentMatterController {
      try? controller.cancelCommissioning(forNodeID: NSNumber(value: deviceId))
    }
    clearCommissioningSessionState()
    didFireCommissioningOutcome = true
  }

  /// True for the first terminal callback of a session, false for any repeat.
  private func claimCommissioningOutcome() -> Bool {
    if didFireCommissioningOutcome {
      return false
    }
    didFireCommissioningOutcome = true
    return true
  }
}

// MARK: - Commissioning Pipeline

@available(iOS 16.4, *)
extension ESPMatterModule {

  /// Start Apple fabric commissioning using MatterSupport framework
  private func startAppleFabricCommissioning(qrData: String, fabric: [String: Any], sessionId: Int) throws {

    guard let fabricName = fabric[ESPMatterConstants.name] as? String else {
      throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: ESPMatterConstants.fabricNameRequired
      ])
    }

    // Import MatterSupport framework for Apple commissioning
    if #available(iOS 16.4, *) {
      Task {
        do {
          // Parse the onboarding payload (QR "MT:..." or a manual pairing code).
          // A nil result means the payload failed to parse; surface it through the
          // catch below instead of silently completing the do-block (which would
          // leave the JS commissioning promise pending and the screen stuck on the
          // spinner). Mirrors startMatterCommissioningWithUserNOC's guard.
          guard let setupPayload = try? MTRSetupPayload(onboardingPayload: qrData) else {
            throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
              NSLocalizedDescriptionKey: ESPMatterConstants.failedToParseQR
            ])
          }
          // Create MatterAddDeviceRequest topology
          let topology = MatterAddDeviceRequest.Topology(
            ecosystemName: ESPMatterConstants.ecosystemName,
            homes: [MatterAddDeviceRequest.Home(displayName: fabricName)]
          )
          let setupRequest = MatterAddDeviceRequest(topology: topology, setupPayload: setupPayload)

          try await setupRequest.perform()

          // The add was cancelled while Apple's sheet was open.
          let stillCurrent = await MainActor.run { self.commissioningSessionId == sessionId }
          guard stillCurrent else { return }

          // Step 2: Start custom fabric commissioning after Apple commissioning
          guard let qrData = ESPMatterEcosystemInfo.shared.getOnboardingPayload() else {
            throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
              NSLocalizedDescriptionKey: ESPMatterConstants.missingOnboardingPayloadMsg
            ])
          }
          try await self.startCustomFabricCommissioning(qrData: qrData, fabric: fabric)
        } catch {

          let msg = String(format: ESPMatterConstants.appleCommissioningFailedMsg, error.localizedDescription)
          DispatchQueue.main.async {
            // A cancelled session was already cleared; never touch a newer one.
            guard self.commissioningSessionId == sessionId else { return }
            self.emitCommissioningErrorToReactNative(message: msg)
            self.rejectCommissioningStart(ESPMatterConstants.appleCommissioningFailed, msg, error)
            self.clearCommissioningSessionState()
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

  /// Starts commissioning on the legacy `setupCommissioningSession` path, where the
  /// NOC is issued through `MTROperationalCertificateIssuer`.
  ///
  /// - Parameter qrData: QR code or manual pairing payload for the device.
  /// - Throws: When the controller is not initialised or the payload cannot be parsed.
  private func startMatterCommissioningWithUserNOC(qrData: String) throws {

    guard let controller = currentMatterController else {
      throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: ESPMatterConstants.controllerNotInitialized
      ])
    }

    // Neo sessions on iOS 26.2+ must NOT use the legacy setupCommissioningSession →
    // commissionNode split: that path runs on an internally-created
    // MTRCommissioningOperation whose parameters are fixed at creation with a random
    // CSR nonce, so the /initiate challenge never reaches the device's CSRRequest and
    // the verify step rejects it ("CSRNonce does not match the challenge from initiate").
    // Creating the operation ourselves binds the nonce from the start.
    if #available(iOS 26.2, *), isNonceBoundSession {
      try startNonceBoundCommissioning(qrData: qrData, controller: controller)
      return
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

  /// iOS 26.2+ Neo commissioning: drives MTRCommissioningOperation directly with the
  /// CSR nonce already in the parameters (they cannot be changed after creation).
  /// Attestation and completion arrive via MTRCommissioningDelegate; the NOC flow
  /// still goes through the controller's operationalCertificateIssuer unchanged.
  @available(iOS 26.2, *)
  private func startNonceBoundCommissioning(qrData: String, controller: MTRDeviceController) throws {
    let params = MTRCommissioningParameters()
    params.csrNonce = currentCsrNonce
    // deviceAttestationDelegate is ignored by MTRCommissioningOperation — attestation
    // is delivered to the MTRCommissioningDelegate instead.

    guard let operation = MTRCommissioningOperation(
      parameters: params,
      setupPayload: qrData,
      delegate: self,
      queue: matterQueue
    ) else {
      throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: ESPMatterConstants.failedToParseQR
      ])
    }

    currentCommissioningOperation = operation
    operation.start(with: controller)
  }

  /// Builds commissioning parameters for the custom-fabric pass (I2). On Neo
  /// sessions the `/initiate` challenge is bound as the CSR nonce so the
  /// device echoes it inside its NOCSR elements — `/verify` rejects
  /// any other nonce. Classic sessions let the CHIP stack pick a random nonce.
  private func makeCommissioningParameters() -> MTRCommissioningParameters {
    let params = MTRCommissioningParameters()
    params.deviceAttestationDelegate = self
    if let csrNonce = currentCsrNonce {
      params.csrNonce = csrNonce
    }
    return params
  }

  /// Fails the pending NOC issuance and the JS promise with the same error.
  ///
  /// - Parameters:
  ///   - completion: The CHIP issuer completion waiting on this response.
  ///   - code: Promise rejection code.
  ///   - message: Error description handed to CHIP, and to JS unless `rejectMessage` is set.
  ///   - rejectMessage: Alternative description for the JS promise.
  ///   - reject: The promise's reject block.
  private func failNocIssuance(_ completion: (MTROperationalCertificateChain?, Error?) -> Void,
                               code: String,
                               message: String,
                               rejectMessage: String? = nil,
                               rejecter reject: RCTPromiseRejectBlock) {
    let error = NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
      NSLocalizedDescriptionKey: message
    ])
    completion(nil, error)
    currentNOCCompletion = nil
    reject(code, rejectMessage ?? message, error)
  }

  /// The fabric's root CA in DER: from the live fabric details first, then from the
  /// Keychain pre-commission copy.
  private func resolveRootCaDer() -> Data? {
    var rootCaString: String?
    if let fabricDetails = currentFabricInfo?[ESPMatterConstants.fabricDetails] as? [String: Any],
       let ca = (fabricDetails[ESPMatterConstants.rootCa] ?? fabricDetails[ESPMatterConstants.rootCaSnake]) as? String,
       !ca.isEmpty {
      rootCaString = ca
    }
    let fabricId = currentFabricId
    if (rootCaString == nil || rootCaString?.isEmpty == true) && !fabricId.isEmpty {
      let userNOCData = loadUserNOCFromKeychain(fabricId: fabricId)
      rootCaString = (userNOCData[ESPMatterConstants.rootCa] ?? userNOCData[ESPMatterConstants.rootCaSnake]) as? String
    }
    guard let rootCa = rootCaString, !rootCa.isEmpty else { return nil }
    return convertPEMToDER(rootCa)
  }

  /// The fabric's admin CAT (`group_cat_id_admin`) as the CASE admin subject, when
  /// the fabric details carry one.
  private func resolveAdminSubject() -> NSNumber? {
    guard let fabricDetails = currentFabricInfo?[ESPMatterConstants.fabricDetails] as? [String: Any],
          let catIdAdminHex = (fabricDetails[ESPMatterConstants.groupCatIdAdmin] ?? fabricDetails[ESPMatterConstants.groupCatIdAdminCamel]) as? String,
          !catIdAdminHex.isEmpty,
          let catIdDecimal = ESPMatterAclOps.subject(fromCatIdHex: catIdAdminHex) else {
      return nil
    }
    return NSNumber(value: catIdDecimal)
  }
}

// MARK: - Controller Lifecycle

@available(iOS 16.4, *)
extension ESPMatterModule {

  /// Operational credentials for one fabric as stored in the Keychain by
  /// `ESPMatterUtilityModule.storePrecommissionInfo`.
  private struct FabricCredentials {
    let groupId: String
    let fabricId: String
    let userNoc: String
    let matterUserId: String
    let rootCa: String
  }

  /// Starts a Matter controller on `fabric` using the Keychain-stored user NOC,
  /// replacing any controller that is already running. A controller that is already
  /// up on the same fabric is reused as is.
  ///
  /// - Parameter fabric: Fabric details; `id` is required, `fabricId` and a
  ///   the synced `fabricDetails.ipk` are used when present.
  /// - Throws: When the fabric has no stored credentials, the certificates cannot be
  ///   decoded, or the controller factory or controller fails to start.
  private func initializeMatterControllerWithFabric(_ fabric: [String: Any]) throws {
    guard let groupId = fabric[ESPMatterConstants.id] as? String else {
      throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: ESPMatterConstants.fabricIdRequiredForInit
      ])
    }
    let fabricId = fabric[ESPMatterConstants.fabricId] as? String ?? groupId

    // Nothing to do when this fabric is already loaded and its controller is alive.
    // Both conditions matter: a controller that was shut down elsewhere leaves the
    // factory stopped, and that case still has to rebuild.
    if activeControllerFabricId == fabricId,
       currentMatterController != nil,
       MTRDeviceControllerFactory.sharedInstance().isRunning {
      return
    }

    let credentials = try loadFabricCredentials(groupId: groupId, fabricId: fabricId)

    // Shutdown existing controller if any
    shutdownMatterController()

    let factory = try startControllerFactory()
    let params = try makeControllerStartupParams(fabric: fabric, credentials: credentials)
    let controller = try createController(with: params, from: factory)

    activeControllerFabricId = fabricId

    // Set controller delegate for commissioning callbacks
    controller.setDeviceControllerDelegate(self, queue: matterQueue)
    currentMatterController = controller
  }

  /// Loads the fabric's user NOC, root CA and ids from the Keychain.
  ///
  /// - Parameters:
  ///   - groupId: The fabric's group id, used to derive the operational keypair.
  ///   - fabricId: The Keychain storage key for the fabric's NOC record.
  /// - Throws: When the Keychain holds no complete NOC record for `fabricId`.
  private func loadFabricCredentials(groupId: String, fabricId: String) throws -> FabricCredentials {
    let userNOCData = loadUserNOCFromKeychain(fabricId: fabricId)

    let userNoc = userNOCData[ESPMatterConstants.userNOC] as? String
      ?? userNOCData[ESPMatterConstants.userNoc] as? String
    guard let userNoc = userNoc,
          let matterUserId = userNOCData[ESPMatterConstants.matterUserId] as? String,
          let rootCa = userNOCData[ESPMatterConstants.rootCa] as? String else {
      throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: String(format: ESPMatterConstants.userNocDataNotFound, fabricId)
      ])
    }

    return FabricCredentials(groupId: groupId,
                             fabricId: fabricId,
                             userNoc: userNoc,
                             matterUserId: matterUserId,
                             rootCa: rootCa)
  }

  /// Starts the shared controller factory on this module's storage.
  ///
  /// - Throws: When the factory refuses to start.
  private func startControllerFactory() throws -> MTRDeviceControllerFactory {
    let factory = MTRDeviceControllerFactory.sharedInstance()
    let factoryParams = MTRDeviceControllerFactoryParams(storage: ESPMatterStorage())
    do {
      try factory.start(factoryParams)
    } catch {
      throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: String(format: ESPMatterConstants.failedToStartFactory, error.localizedDescription)
      ])
    }
    return factory
  }

  /// Builds the controller startup parameters: the fabric's operational keypair
  /// and certificates, the IPK, the configured vendor id and this module as the
  /// operational certificate issuer.
  ///
  /// - Parameters:
  ///   - fabric: Fabric details, read for a synced `fabricDetails.ipk`.
  ///   - credentials: The fabric's stored NOC and root CA.
  /// - Throws: When either certificate fails to decode from PEM.
  private func makeControllerStartupParams(fabric: [String: Any],
                                           credentials: FabricCredentials) throws -> MTRDeviceControllerStartupParams {
    // Create CSR keys for this fabric
    let csrKeys = MTRCSRKeys(groupId: credentials.groupId)

    guard let rootCADerBytes = convertPEMToDER(credentials.rootCa),
          let nocDerBytes = convertPEMToDER(credentials.userNoc) else {
      throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: ESPMatterConstants.failedToConvertCerts
      ])
    }

    let params = MTRDeviceControllerStartupParams(
      ipk: resolveIpk(fabric: fabric, localIpk: csrKeys.ipk),
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
    return params
  }

  /// Prefers the synced IPK so all controllers on this fabric agree on it, and
  /// falls back to the locally generated IPK only if that value is missing or
  /// fails to decode (matches the production esp-rainmaker-ios behavior).
  private func resolveIpk(fabric: [String: Any], localIpk: Data) -> Data {
    guard let fabricDetails = fabric[ESPMatterConstants.fabricDetails] as? [String: Any],
          let ipkHex = fabricDetails[ESPMatterConstants.ipk] as? String else {
      return localIpk
    }
    let trimmedIpk = ipkHex.replacingOccurrences(of: " ", with: "")
    guard !trimmedIpk.isEmpty, let syncedIpk = trimmedIpk.matterHexData else {
      return localIpk
    }
    return syncedIpk
  }

  /// Creates the controller on the fabric's existing entry, or on a new fabric when
  /// the factory has none for these credentials yet.
  ///
  /// - Throws: When neither attempt yields a controller.
  private func createController(with params: MTRDeviceControllerStartupParams,
                                from factory: MTRDeviceControllerFactory) throws -> MTRDeviceController {
    if let controller = try? factory.createController(onExistingFabric: params) {
      return controller
    }
    do {
      return try factory.createController(onNewFabric: params)
    } catch {
      throw NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
        NSLocalizedDescriptionKey: String(format: ESPMatterConstants.failedToCreateController, error.localizedDescription)
      ])
    }
  }

  /// Shutdown existing Matter controller
  private func shutdownMatterController() {

    activeControllerFabricId = nil

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
}

// MARK: - Keychain Storage

@available(iOS 16.4, *)
extension ESPMatterModule {

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
}

// MARK: - Certificate and JSON Encoding

@available(iOS 16.4, *)
extension ESPMatterModule {

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

  /// Convert dictionary to JSON string
  private func jsonString(from dictionary: [String: Any]) throws -> String {
    let jsonData = try JSONSerialization.data(withJSONObject: dictionary)
    return String(data: jsonData, encoding: .utf8) ?? ""
  }
}

// MARK: - Post-Commissioning

@available(iOS 16.4, *)
extension ESPMatterModule {

  /// The node id post-commissioning steps address: the operational id from the NOC
  /// response when known, otherwise the temporary id used to open the session.
  private var commissionedDeviceId: UInt64? {
    currentMatterNodeId ?? currentDeviceId
  }

  /// Runs the post-commissioning steps straight away against the device that was
  /// just commissioned, falling back to the delayed detection when no device handle
  /// is available.
  private func performPostCommissioningActionsImmediate() {

    guard let fabricInfo = currentFabricInfo,
          let groupId = fabricInfo[ESPMatterConstants.id] as? String,
          let controller = currentMatterController,
          let deviceId = commissionedDeviceId else {
      return
    }

    let device = (try? controller.getDeviceBeingCommissioned(deviceId))
      ?? MTRBaseDevice(nodeID: NSNumber(value: deviceId), controller: controller)

    detectDeviceTypeImmediate(device: device, deviceId: deviceId, groupId: groupId)
  }

  /// Runs the post-commissioning steps after the delayed, retrying RainMaker cluster
  /// detection. Fallback for when the immediate wildcard read is not possible.
  private func performPostCommissioningActions() {

    guard let fabricInfo = currentFabricInfo,
          let groupId = fabricInfo[ESPMatterConstants.id] as? String,
          let deviceId = commissionedDeviceId else {
      return
    }

    detectDeviceTypeWithRetry(deviceId: deviceId, groupId: groupId)
  }

  // MARK: - RainMaker Device Detection and Handling

  /// Reads the whole device data model in one wildcard read, records it for the
  /// the Matter metadata, and routes the device by whether endpoint 0 serves the RainMaker
  /// cluster. Falls back to the retrying descriptor read if the wildcard read fails.
  private func detectDeviceTypeImmediate(device: MTRBaseDevice, deviceId: UInt64, groupId: String) {

    device.readAttributes(withEndpointID: nil,
                          clusterID: nil,
                          attributeID: nil,
                          params: nil,
                          queue: matterQueue) { [weak self] values, error in

      guard let self = self else {
        return
      }

      guard let values = values, error == nil else {
        self.detectDeviceTypeWithRetry(deviceId: deviceId, groupId: groupId)
        return
      }

      let deviceInfo = ESPMatterModule.parseDeviceInfo(from: values)
      self.lastParsedDeviceInfo = deviceInfo

      let serverClusters = deviceInfo.endpoints.flatMap { endpoint in
        endpoint.servers.map { $0.id }
      }

      // Store parsed device info and server clusters data
      self.storeDeviceInfo(deviceId: deviceId, groupId: groupId, deviceInfo: deviceInfo)
      self.storeServerClustersData(deviceId: deviceId, groupId: groupId, serverClusters: serverClusters)

      self.routeCommissionedDevice(isRainMaker: serverClusters.contains(RainMakerCluster.clusterId),
                                   deviceId: deviceId,
                                   groupId: groupId)
    }
  }

  /// Detects the RainMaker cluster with the delayed, retrying descriptor read and
  /// routes the device accordingly.
  private func detectDeviceTypeWithRetry(deviceId: UInt64, groupId: String) {
    detectDeviceType(deviceId: deviceId) { [weak self] isRainMaker in
      self?.routeCommissionedDevice(isRainMaker: isRainMaker, deviceId: deviceId, groupId: groupId)
    }
  }

  /// Records the detection result for the terminal event and hands the device to the
  /// RainMaker or pure Matter confirmation flow.
  private func routeCommissionedDevice(isRainMaker: Bool, deviceId: UInt64, groupId: String) {
    isRainMakerDevice = isRainMaker
    if isRainMaker {
      handleRainMakerDevice(deviceId: deviceId, groupId: groupId)
    } else {
      handlePureMatterDevice(deviceId: deviceId, groupId: groupId)
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

    let matterMetadata = buildMatterMetadata(
      deviceName: deviceName,
      isRainmaker: false,
      groupId: groupId
    )

    let metadata: [String: Any] = [
      ESPMatterConstants.matter: matterMetadata
    ]

    // Pure Matter confirm needs `matterNodeId` for the Matter SDK's
    // startCommissioning event handler validation; rainmakerNodeId / challenge
    // are intentionally omitted (`confirmPureMatterNode` does not require them).
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

    emitConfirmationRequestAfterAcl(deviceId: deviceId, requestData: requestData)
  }

  /// Builds the canonical Matter metadata payload (the `Matter` sub-object
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
  private func buildMatterMetadata(
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

    return matterMetadata
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

  /// Build the inner `endpoints` map for the Matter metadata, organized by clusters.
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

  /// Completes commissioning of a RainMaker node by answering the challenge.
  ///
  /// - Parameters:
  ///   - deviceId: Matter operational node id of the commissioned device.
  ///   - groupId: Fabric group the node was commissioned into.
  ///   - rainmakerNodeId: RainMaker node id read from the device's RainMaker cluster.
  ///   - challenge: Challenge string the device returned, echoed back through the SDK.
  private func confirmRainMakerCommissioning(deviceId: UInt64, groupId: String, rainmakerNodeId: String, challenge: String) {

    let deviceNameFromAppleCommissioning = ESPMatterEcosystemInfo.shared.getDeviceName()
    let deviceName = deviceNameFromAppleCommissioning ?? ESPMatterConstants.defaultDeviceName

    let matterNodeIdHex = String(format: ESPMatterConstants.matterNodeIdFormat, deviceId)
    let requestId = currentRequestId ?? String(deviceId)

    let matterMetadata = buildMatterMetadata(
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

    emitConfirmationRequestAfterAcl(deviceId: deviceId, requestData: requestData)
  }
}

// MARK: - Access Control (RMNeo)

@available(iOS 16.4, *)
extension ESPMatterModule {

  /// The session's fabric id, from whichever key the fabric details carried it under.
  private var currentFabricId: String {
    currentFabricInfo?[ESPMatterConstants.fabricId] as? String
      ?? currentFabricInfo?[ESPMatterConstants.id] as? String
      ?? ""
  }

  /// ACL first (Neo-gated, non-fatal), then hand off to the SDK for confirm —
  /// same ordering as Android's post-commissioning steps.
  private func emitConfirmationRequestAfterAcl(deviceId: UInt64, requestData: [String: Any]) {
    writeOperateCatAclIfNeeded(deviceId: deviceId) { [weak self] in
      self?.emitMatterEvent(
        eventType: ESPMatterConstants.commissioningConfirmationRequest,
        data: requestData
      )
    }
  }

  /// Resolves the fabric's *operate* CAT id (hex, no `0x`): live fabric details
  /// first (snake_case from the node config, camelCase from JS), then the Keychain
  /// pre-commission copy.
  private func resolveGroupCatIdOperate() -> String? {
    if let fabricDetails = currentFabricInfo?[ESPMatterConstants.fabricDetails] as? [String: Any],
       let catId = (fabricDetails[ESPMatterConstants.groupCatIdOperate]
                    ?? fabricDetails[ESPMatterConstants.groupCatIdOperateCamel]) as? String,
       !catId.isEmpty {
      return catId
    }
    let fabricId = currentFabricId
    guard !fabricId.isEmpty else { return nil }
    let stored = loadUserNOCFromKeychain(fabricId: fabricId)
    let storedCatId = stored[ESPMatterConstants.groupCatIdOperateCamel] as? String
    return (storedCatId?.isEmpty == false) ? storedCatId : nil
  }

  /// Grants *Operate* to every fabric member by appending an ACL entry on endpoint 0
  /// whose subject is the fabric's operate CAT (`0xFFFFFFFD` + CAT id), mirroring
  /// Android's post-commissioning ACL write. Runs only for a nonce-bound session.
  ///
  /// Non-fatal by design, so `completion` always runs and commissioning proceeds.
  ///
  /// - Parameters:
  ///   - deviceId: Matter operational node id of the commissioned device.
  ///   - completion: Called once the write finishes or is skipped, success or not.
  func writeOperateCatAclIfNeeded(deviceId: UInt64, completion: @escaping () -> Void) {
    guard isNonceBoundSession, let controller = currentMatterController else {
      completion()
      return
    }

    guard let catIdHex = resolveGroupCatIdOperate(),
          let subject = ESPMatterAclOps.subject(fromCatIdHex: catIdHex) else {
      completion()
      return
    }

    controller.getBaseDevice(deviceId, queue: matterQueue) { [weak self] device, error in
      guard let self = self, let device = device, error == nil else {
        completion()
        return
      }

      ESPMatterAclOps.readEntries(device: device, queue: self.matterQueue) { result in
        switch result {
        case .failure:
          completion()
        case .success(let entries):
          self.appendOperateCatEntry(subject: subject, to: entries, device: device, completion: completion)
        }
      }
    }
  }

  /// Appends the operate-CAT entry to an entry list already read from the device,
  /// unless the CAT is already granted.
  ///
  /// An ACL write replaces the fabric's whole entry list, so a second run against the
  /// same device would append a duplicate operate-CAT entry and can exhaust
  /// AccessControlEntriesPerFabric (typically 4–8). Past that the write fails with
  /// RESOURCE_EXHAUSTED, and because this path is non-fatal commissioning would still
  /// report success while the CAT never lands. Matching by CAT identifier the way
  /// `matterUpdateCatAclSubject` does treats a rotated version as the same grant.
  ///
  /// - Parameters:
  ///   - subject: The fabric's operate CAT subject.
  ///   - entries: This fabric's ACL entries as read from the device.
  ///   - device: The commissioned device.
  ///   - completion: Called once the write finishes or is skipped, success or not.
  private func appendOperateCatEntry(subject: UInt64,
                                     to entries: [[String: Any]],
                                     device: MTRBaseDevice,
                                     completion: @escaping () -> Void) {
    if ESPMatterAclOps.findSubject(sharingIdentifierWith: subject, in: entries) != nil {
      completion()
      return
    }

    // Reuse the admin entry's authMode/fabricIndex for the new entry, same as Android.
    let context = ESPMatterAclOps.extractAdminEntryContext(from: entries) ?? .fallback
    var updated = entries
    updated.append(ESPMatterAclOps.makeOperateEntry(subject: subject,
                                                    authMode: context.authMode,
                                                    fabricIndex: context.fabricIndex))

    ESPMatterAclOps.writeEntries(updated, device: device, queue: matterQueue) { _ in
      completion()
    }
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
      guard claimCommissioningOutcome() else { return }
      let err = error!
      let failureEvent: [String: Any] = [
        ESPMatterConstants.eventType: ESPMatterConstants.commissioningComplete,
        ESPMatterConstants.success: false,
        ESPMatterConstants.error: err.localizedDescription
      ]
      let msg = String(format: ESPMatterConstants.commissioningFailedPairingMsg, err.localizedDescription)
      DispatchQueue.main.async {
        self.emitMatterEvent(eventType: ESPMatterConstants.commissioningComplete, data: failureEvent)
        self.rejectCommissioningStart(ESPMatterConstants.commissioningFailedPairing, msg, err)
        self.clearCommissioningSessionState()
      }
      return
    }

    guard claimCommissioningOutcome() else { return }
    // Perform post-commissioning actions immediately
    // The device is ready for cluster operations right after commissioning complete
    performPostCommissioningActionsImmediate()
  }

  func controller(_ : MTRDeviceController, commissioningSessionEstablishmentDone error: Error?) {
    if let error = error {
      let msg = String(format: ESPMatterConstants.failedToSetupSession, error.localizedDescription)
      DispatchQueue.main.async {
        self.emitCommissioningErrorToReactNative(message: msg)
        self.rejectCommissioningStart(ESPMatterConstants.commissioningFailed, msg, error)
        self.clearCommissioningSessionState()
      }
      shutdownMatterController()
      return
    }
    if let deviceId = currentDeviceId {
      let params = makeCommissioningParameters()
      if let controller = currentMatterController {
        do {
          try controller.commissionNode(withID: NSNumber(value: deviceId), commissioningParams: params)
        } catch {
          DispatchQueue.main.async {
            let failMsg = String(format: ESPMatterConstants.failedToStartCommissionNode, error.localizedDescription)
            self.emitCommissioningErrorToReactNative(message: failMsg)
            self.rejectCommissioningStart(ESPMatterConstants.commissionNodeAfterPairingFailed, failMsg, error)
            self.clearCommissioningSessionState()
          }
        }
      }
    }
  }
}

// MARK: - MTRCommissioningDelegate (iOS 26.2+ Neo path)

@available(iOS 26.2, *)
extension ESPMatterModule: MTRCommissioningDelegate {

  func commissioning(_ commissioning: MTRCommissioningOperation,
                     completedDeviceAttestation attestationDeviceInfo: MTRDeviceAttestationDeviceInfo,
                     error: Error?,
                     completion: @escaping () -> Void) {
    // Parity with the legacy path's attestation delegate: proceed regardless of the
    // attestation outcome (uncertified ESP dev boards must commission).
    completion()
  }

  func commissioning(_ commissioning: MTRCommissioningOperation,
                     succeededForNodeID nodeID: NSNumber,
                     metrics: MTRMetrics) {
    currentCommissioningOperation = nil
    // The operational node id comes from the issued NOC; sendNocResponse
    // normally records it already, so these are fallbacks.
    if currentMatterNodeId == nil {
      currentMatterNodeId = nodeID.uint64Value
    }
    if currentDeviceId == nil {
      currentDeviceId = nodeID.uint64Value
    }
    guard claimCommissioningOutcome() else { return }
    performPostCommissioningActionsImmediate()
  }

  func commissioning(_ commissioning: MTRCommissioningOperation,
                     failedWithError error: Error,
                     metrics: MTRMetrics) {
    currentCommissioningOperation = nil
    guard claimCommissioningOutcome() else { return }
    let failureEvent: [String: Any] = [
      ESPMatterConstants.eventType: ESPMatterConstants.commissioningComplete,
      ESPMatterConstants.success: false,
      ESPMatterConstants.error: error.localizedDescription
    ]
    let msg = String(format: ESPMatterConstants.commissioningFailedPairingMsg, error.localizedDescription)
    DispatchQueue.main.async {
      self.emitMatterEvent(eventType: ESPMatterConstants.commissioningComplete, data: failureEvent)
      self.rejectCommissioningStart(ESPMatterConstants.commissioningFailedPairing, msg, error)
      self.clearCommissioningSessionState()
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

    currentNOCCompletion = completion

    if isNonceBoundSession {
      emitNonceBoundAttestationData(csrInfo: csrInfo, attestationInfo: attestationInfo)
    } else {
      emitClassicNocRequest(csrInfo: csrInfo)
    }
  }

  /// RMNeo (I3): /verify consumes the NOCSR evidence directly. The
  /// csrElementsTLV MUST be forwarded verbatim (it embeds vendor_reserved1;
  /// re-encoding would break the attestation signature). The SDK answers with
  /// an ISSUE_NODE_NOC_RESPONSE postMessage that lands in `sendNocResponse`.
  private func emitNonceBoundAttestationData(csrInfo: MTROperationalCSRInfo,
                                             attestationInfo: MTRDeviceAttestationInfo) {
    let attestationChallengeHex = attestationInfo.challenge.hexadecimalString.lowercased()

    emitMatterEvent(eventType: ESPMatterConstants.rmNeoAttestationChallenge, data: [
      ESPMatterConstants.attestationChallenge: attestationChallengeHex
    ])

    let nocsrHex = csrInfo.csrElementsTLV.hexadecimalString.lowercased()
    let attestationData: [String: Any] = [
      ESPMatterConstants.requestId: currentRequestId ?? "",
      ESPMatterConstants.nocsrElements: nocsrHex,
      ESPMatterConstants.attestationSignature: csrInfo.attestationSignature.hexadecimalString.lowercased(),
      ESPMatterConstants.attestationChallenge: attestationChallengeHex
    ]
    emitMatterEvent(eventType: ESPMatterConstants.rmNeoMatterAttestationData, data: attestationData)
  }

  /// Classic RainMaker: hands the CSR to the SDK as PEM and waits for the NOC to
  /// come back through `sendNocResponse`.
  private func emitClassicNocRequest(csrInfo: MTROperationalCSRInfo) {
    let csrString = csrInfo.csr.base64EncodedString()
    let csrPEM = "\(ESPMatterConstants.beginCertificateRequest)\n\(csrString)\n\(ESPMatterConstants.endCertificateRequest)"

    var requestData: [String: Any] = [
      ESPMatterConstants.csr: csrPEM,
      ESPMatterConstants.groupId: currentFabricInfo?[ESPMatterConstants.id] as? String ?? "",
      ESPMatterConstants.fabricId: currentFabricInfo?[ESPMatterConstants.fabricId] as? String ?? ""
    ]
    if let deviceIdString = currentDeviceId?.description, !deviceIdString.isEmpty {
      requestData[ESPMatterConstants.deviceId] = deviceIdString
    }

    emitMatterEvent(eventType: ESPMatterConstants.nodeNocRequest, data: requestData)
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
  /// Decodes a hexadecimal string (e.g. an IPK delivered by the SDK) into raw bytes.
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
