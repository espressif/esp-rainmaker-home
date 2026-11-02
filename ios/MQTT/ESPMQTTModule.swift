/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation
import React

private let kMqttMessageEvent = "mqttMessageReceived"
private let kMqttConnectionStatusEvent = "mqttConnectionStatus"
private let kIotDataManagerKey = "com.espressif.ESPMQTTModule.IoT"
/// Longest a connect() may take before it is given up and rejected.
private let kConnectTimeoutSeconds: Double = 15

/// One connect() call plus any callers that joined it. Answered exactly once, by
/// the first outcome: connected, failed, timed out or cancelled. Used on `queue` only.
private final class ConnectAttempt {
  private var callers: [(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock)]
  private var answered = false

  init(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    callers = [(resolve: resolve, reject: reject)]
  }

  /// Adds a caller; false once the attempt has answered.
  func join(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Bool {
    if answered { return false }
    callers.append((resolve: resolve, reject: reject))
    return true
  }

  func succeed() {
    for caller in takeCallers() {
      DispatchQueue.main.async { caller.resolve(nil) }
    }
  }

  func fail(code: String, message: String) {
    for caller in takeCallers() {
      DispatchQueue.main.async { caller.reject(code, message, nil) }
    }
  }

  /// Returns the callers the first time only; later calls get none.
  private func takeCallers() -> [(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock)] {
    if answered { return [] }
    answered = true
    let waiting = callers
    callers = []
    return waiting
  }
}

@objc(ESPMQTTModule)
class ESPMQTTModule: RCTEventEmitter {

  private let queue = DispatchQueue(label: "com.espressif.ESPMQTTModule", qos: .userInitiated)
  /// The connect() call still waiting for its outcome, if any.
  private var pendingConnect: ConnectAttempt?
  /// Bumped for every new client; status callbacks from an older (replaced or closed) one are ignored.
  private var clientGeneration = 0
  /// `AWSIoTDataManager(forKey:)` is non-optional in Swift; track registration locally (matches disconnect/remove lifecycle).
  private var hasActiveIoTRegistration = false
  /// Last `connected` value emitted on `mqttConnectionStatus` (dedupe).
  private var lastEmittedConnected: Bool?

  override static func moduleName() -> String! {
    "ESPMQTTModule"
  }

  override func supportedEvents() -> [String]! {
    [kMqttMessageEvent, kMqttConnectionStatusEvent]
  }

  /// Emits `mqttConnectionStatus` when [connected] changes.
  private func emitConnectionStatus(connected: Bool) {
    if lastEmittedConnected == connected {
      return
    }
    lastEmittedConnected = connected
    DispatchQueue.main.async { [weak self] in
      self?.sendEvent(
        withName: kMqttConnectionStatusEvent,
        body: ["connected": connected]
      )
    }
  }

  override static func requiresMainQueueSetup() -> Bool {
    false
  }

  // MARK: - Endpoint / region (no hardcoded region map — use AWSCore string lookup + optional JS `region`)

  private func normalizeEndpointHost(_ raw: String) -> String {
    var host = raw
    if host.hasPrefix("https://") {
      host = String(host.dropFirst("https://".count))
    } else if host.hasPrefix("http://") {
      host = String(host.dropFirst("http://".count))
    } else if host.hasPrefix("wss://") {
      host = String(host.dropFirst("wss://".count))
    } else if host.hasPrefix("ws://") {
      host = String(host.dropFirst("ws://".count))
    }
    if host.hasSuffix("/mqtt") || host.hasSuffix("/mqtt/") {
      if host.hasSuffix("/") {
        host = String(host.dropLast())
      }
      if host.hasSuffix("/mqtt") {
        host = String(host.dropLast("/mqtt".count))
      }
    }
    let parts = host.split(separator: "/")
    return parts.first.map(String.init) ?? host
  }

  /// Extracts the AWS region id (e.g. `us-east-1`) from standard IoT Core hostnames.
  private func parseRegionId(fromIotEndpointHost host: String) -> String? {
    let parts = host.split(separator: ".").map(String.init)
    for i in parts.indices {
      if parts[i] == "iot", i + 1 < parts.count {
        return parts[i + 1]
      }
      if parts[i].hasPrefix("iot-"), parts[i] != "iot", i + 1 < parts.count {
        return parts[i + 1]
      }
    }
    return nil
  }

  /// Resolves `AWSRegionType` using AWSCore's `NSString.aws_regionTypeValue` (kept in sync with new regions in the pod).
  private func awsRegionType(regionId: String) -> AWSRegionType {
    (regionId as NSString).aws_regionTypeValue()
  }

  /// Disconnects and removes the client, so the SDK stops its own retries. Its later
  /// status callbacks are ignored. Runs on `queue`.
  private func closeClient() {
    clientGeneration += 1
    guard hasActiveIoTRegistration else { return }
    AWSIoTDataManager(forKey: kIotDataManagerKey).disconnect()
    AWSIoTDataManager.remove(forKey: kIotDataManagerKey)
    hasActiveIoTRegistration = false
    lastEmittedConnected = false
  }

  /// Closes any existing client, waits a short moment, then runs [completion] on `queue`.
  private func teardownIoTClient(completion: @escaping () -> Void) {
    let hadClient = hasActiveIoTRegistration
    closeClient()
    if hadClient {
      queue.asyncAfter(deadline: .now() + 1.0) {
        completion()
      }
    } else {
      completion()
    }
  }

  /// Handles one AWS status callback (on `queue`) for the client of [generation].
  private func handleStatus(_ status: AWSIoTMQTTStatus, generation: Int, attempt: ConnectAttempt) {
    guard generation == clientGeneration, hasActiveIoTRegistration else { return }
    switch status {
    case .connected:
      if pendingConnect === attempt { pendingConnect = nil }
      emitConnectionStatus(connected: true)
      attempt.succeed()
    case .disconnected, .connectionError, .connectionRefused, .protocolError:
      emitConnectionStatus(connected: false)
      // Lost before it was ever up = this connect failed. Closing the client stops
      // the SDK retrying with these credentials. After Connected the SDK reconnects itself.
      guard pendingConnect === attempt else { return }
      pendingConnect = nil
      closeClient()
      attempt.fail(code: "connection_failed", message: "MQTT connection failed (status \(status.rawValue))")
    default:
      break
    }
  }

  /// Full connect path; `connect` only schedules this so `queue.async` stays a tiny closure (Swift type-checker).
  private func performConnect(
    config: NSDictionary,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    if hasActiveIoTRegistration,
       AWSIoTDataManager(forKey: kIotDataManagerKey).getConnectionStatus() == .connected {
      DispatchQueue.main.async { resolve(nil) }
      return
    }
    // A second caller waits for the connect already running instead of starting another.
    if let running = pendingConnect, running.join(resolve: resolve, reject: reject) {
      return
    }

    guard let accessKeyId = config["accessKeyId"] as? String, !accessKeyId.isEmpty,
          let secretAccessKey = config["secretAccessKey"] as? String, !secretAccessKey.isEmpty,
          let sessionToken = config["sessionToken"] as? String, !sessionToken.isEmpty,
          let endpointRaw = config["endpoint"] as? String, !endpointRaw.isEmpty
    else {
      DispatchQueue.main.async {
        reject("invalid_args", "Missing credentials", nil)
      }
      return
    }

    let host = normalizeEndpointHost(endpointRaw)
    guard let serviceURL = URL(string: "https://\(host)") else {
      DispatchQueue.main.async {
        reject("invalid_args", "Invalid endpoint", nil)
      }
      return
    }

    let clientId = (config["clientId"] as? String).flatMap { $0.isEmpty ? nil : $0 }
      ?? "ios-\(UUID().uuidString)"

    let credentialsProvider = AWSBasicSessionCredentialsProvider(
      accessKey: accessKeyId,
      secretKey: secretAccessKey,
      sessionToken: sessionToken
    )

    let trimmedOverride: String? = {
      guard let r = config["region"] as? String else { return nil }
      let t = r.trimmingCharacters(in: .whitespacesAndNewlines)
      return t.isEmpty ? nil : t
    }()
    let resolvedRegion = trimmedOverride ?? parseRegionId(fromIotEndpointHost: host)
    guard let regionId = resolvedRegion else {
      DispatchQueue.main.async {
        reject(
          "invalid_args",
          "Could not determine AWS region: pass config.region (e.g. us-east-1) or use a standard IoT endpoint host (*.iot.<region>.amazonaws.com).",
          nil
        )
      }
      return
    }
    let regionType = awsRegionType(regionId: regionId)
    // Avoid `== .unknown`: Swift may resolve `.unknown` as `FormatStyleCapitalizationContext`,
    // not `AWSRegionType.unknown`. AWSCore defines `AWSRegionTypeUnknown` as raw value 0.
    if regionType.rawValue == 0 {
      DispatchQueue.main.async {
        reject(
          "invalid_args",
          "Unknown AWS region '\(regionId)'. Pass a supported region id in config.region, or update the AWS iOS SDK.",
          nil
        )
      }
      return
    }

    let endpoint = AWSEndpoint(url: serviceURL)
    guard let serviceConfiguration = AWSServiceConfiguration(
      region: regionType,
      endpoint: endpoint,
      credentialsProvider: credentialsProvider,
      localTestingEnabled: false
    ) else {
      DispatchQueue.main.async {
        reject("invalid_args", "Invalid service configuration", nil)
      }
      return
    }

    let mqttConfig = AWSIoTMQTTConfiguration(
      keepAliveTimeInterval: 40,
      baseReconnectTimeInterval: 1,
      minimumConnectionTimeInterval: 20,
      maximumReconnectTimeInterval: 128,
      runLoop: .current,
      runLoopMode: RunLoop.Mode.default.rawValue,
      autoResubscribe: true,
      lastWillAndTestament: AWSIoTMQTTLastWillAndTestament()
    )

    let attempt = ConnectAttempt(resolve: resolve, reject: reject)
    pendingConnect = attempt
    queue.asyncAfter(deadline: .now() + kConnectTimeoutSeconds) { [weak self] in
      guard let self, self.pendingConnect === attempt else { return }
      self.pendingConnect = nil
      self.closeClient()
      attempt.fail(code: "connection_timeout", message: "MQTT connect gave no answer within 15 s")
    }

    teardownIoTClient { [weak self] in
      // Cancelled by disconnect() or timed out during the teardown wait.
      guard let self, self.pendingConnect === attempt else { return }

      AWSIoTDataManager.register(
        with: serviceConfiguration,
        with: mqttConfig,
        forKey: kIotDataManagerKey
      )
      self.hasActiveIoTRegistration = true
      self.clientGeneration += 1
      let generation = self.clientGeneration

      let iotManager = AWSIoTDataManager(forKey: kIotDataManagerKey)

      let started = iotManager.connectUsingWebSocket(
        withClientId: clientId,
        cleanSession: true
      ) { [weak self] status in
        guard let self else { return }
        self.queue.async { [weak self] in
          self?.handleStatus(status, generation: generation, attempt: attempt)
        }
      }

      if !started, self.pendingConnect === attempt {
        self.pendingConnect = nil
        self.closeClient()
        attempt.fail(code: "connection_failed", message: "connectUsingWebSocket returned false")
      }
    }
  }

  @objc(connect:resolver:rejecter:)
  func connect(
    _ config: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async { [weak self] in
      guard let self else { return }
      self.performConnect(config: config, resolve: resolve, reject: reject)
    }
  }

  @objc(disconnect:rejecter:)
  func disconnect(
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async { [weak self] in
      guard let self else { return }
      // A connect still waiting is answered, so its caller never waits forever.
      let attempt = self.pendingConnect
      self.pendingConnect = nil
      self.closeClient()
      attempt?.fail(code: "disconnected", message: "MQTT disconnect() was called before the connection was up")
      DispatchQueue.main.async { resolve(nil) }
    }
  }

  @objc(isConnected:rejecter:)
  func isConnected(
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async { [weak self] in
      guard let self else { return }
      let connected = self.hasActiveIoTRegistration
        && AWSIoTDataManager(forKey: kIotDataManagerKey).getConnectionStatus() == .connected
      DispatchQueue.main.async { resolve(connected) }
    }
  }

  @objc(publish:payload:resolver:rejecter:)
  func publish(
    _ topic: String,
    payload: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async { [weak self] in
      guard let self else { return }
      guard self.hasActiveIoTRegistration else {
        DispatchQueue.main.async {
          reject("not_connected", "MQTT not connected", nil)
        }
        return
      }
      let manager = AWSIoTDataManager(forKey: kIotDataManagerKey)
      guard manager.getConnectionStatus() == .connected else {
        DispatchQueue.main.async {
          reject("not_connected", "MQTT not connected", nil)
        }
        return
      }
      let ok = manager.publishString(payload, onTopic: topic, qoS: .messageDeliveryAttemptedAtMostOnce)
      if ok {
        DispatchQueue.main.async { resolve(nil) }
      } else {
        DispatchQueue.main.async {
          reject("error", "publish failed", nil)
        }
      }
    }
  }

  @objc(subscribe:resolver:rejecter:)
  func subscribe(
    _ topic: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async { [weak self] in
      guard let self else { return }
      guard self.hasActiveIoTRegistration else {
        DispatchQueue.main.async {
          reject("not_connected", "MQTT not connected", nil)
        }
        return
      }
      let manager = AWSIoTDataManager(forKey: kIotDataManagerKey)
      guard manager.getConnectionStatus() == .connected else {
        DispatchQueue.main.async {
          reject("not_connected", "MQTT not connected", nil)
        }
        return
      }

      let ok = manager.subscribe(
        toTopic: topic,
        qoS: .messageDeliveryAttemptedAtMostOnce,
        extendedCallback: { [weak self] _, receivedTopic, data in
          guard let self else { return }
          let body = (data as Data?) ?? Data()
          let message = String(data: body, encoding: .utf8) ?? ""
          let payload: [String: Any] = [
            "topic": receivedTopic,
            "message": message,
            "timestamp": Date().timeIntervalSince1970 * 1000,
          ]
          DispatchQueue.main.async {
            self.sendEvent(withName: kMqttMessageEvent, body: payload)
          }
        }
      )

      if ok {
        DispatchQueue.main.async { resolve(nil) }
      } else {
        DispatchQueue.main.async {
          reject("error", "subscribe failed", nil)
        }
      }
    }
  }

  @objc(unsubscribe:resolver:rejecter:)
  func unsubscribe(
    _ topic: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async { [weak self] in
      guard let self else { return }
      guard self.hasActiveIoTRegistration else {
        DispatchQueue.main.async {
          reject("not_connected", "MQTT not connected", nil)
        }
        return
      }
      let manager = AWSIoTDataManager(forKey: kIotDataManagerKey)
      guard manager.getConnectionStatus() == .connected else {
        DispatchQueue.main.async {
          reject("not_connected", "MQTT not connected", nil)
        }
        return
      }
      manager.unsubscribeTopic(topic)
      DispatchQueue.main.async { resolve(nil) }
    }
  }
}
