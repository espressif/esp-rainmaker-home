/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Darwin
import Foundation
import React

private let kDefaultMdnsServiceType = "_esp_local_ctrl._tcp."
private let kDefaultMdnsDomain = "local."
private let kMatterOperationalServiceType = "_matter._tcp."

@objc(ESPDiscoveryModule)
class ESPDiscoveryModule: RCTEventEmitter {

  /// Active browse sessions keyed by service type. Each session owns its own
  /// `NetServiceBrowser` + resolution bookkeeping so concurrent browses (e.g.
  /// `_esp_local_ctrl._tcp.` and `_matter._tcp.`) don't share state.
  private var sessionsByType: [String: BrowseSession] = [:]
  private let sessionsQueue = DispatchQueue(label: "ESPDiscoveryModule.sessions")

  override init() {
    super.init(disabledObservation: ())
  }

  override public static func moduleName() -> String {
    return "ESPDiscoveryModule"
  }

  public override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func supportedEvents() -> [String]! {
    return ["DiscoveryUpdate", "DiscoveryLost"]
  }

  /// Starts an mDNS browse session for the given service type. Idempotent — calling it
  /// again with the same `serviceType` while a session is running is a no-op.
  ///
  /// - Parameter params: A dictionary containing:
  ///   - `serviceType`: e.g. `_esp_local_ctrl._tcp.` or `_matter._tcp.`
  ///   - `domain`: SDK sends `local`; Bonjour expects `local.` — normalised below.
  @objc(startDiscovery:)
  func startDiscovery(params: NSDictionary) {
    NSLog("[ESPDiscoveryModule] startDiscovery called params=%@", params)
    var serviceType = (params["serviceType"] as? String)?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    var domain = (params["domain"] as? String)?
      .trimmingCharacters(in: .whitespacesAndNewlines)

    if serviceType == nil || serviceType!.isEmpty {
      serviceType = kDefaultMdnsServiceType
    }
    if domain == nil || domain!.isEmpty {
      domain = kDefaultMdnsDomain
    } else if domain == "local" {
      domain = kDefaultMdnsDomain
    }

    guard let st = serviceType, let dom = domain else {
      NSLog("[ESPDiscoveryModule] startDiscovery: nil serviceType/domain after defaulting; aborting")
      return
    }

    sessionsQueue.sync {
      if sessionsByType[st] != nil {
        NSLog("[ESPDiscoveryModule] session already running for %@", st)
        return
      }
      NSLog("[ESPDiscoveryModule] starting new BrowseSession type=%@ domain=%@", st, dom)
      let session = BrowseSession(serviceType: st, domain: dom, owner: self)
      sessionsByType[st] = session
      session.start()
    }
  }

  /// Stops every active browse session (preserves the legacy semantics that JS callers
  /// like `useOnNetworkDiscovery` rely on).
  @objc(stopDiscovery)
  func stopDiscovery() {
    sessionsQueue.sync {
      for (_, session) in sessionsByType {
        session.stop()
      }
      sessionsByType.removeAll()
    }
  }

  /// Stops a single browse session.
  @objc(stopDiscoveryForType:)
  func stopDiscoveryForType(_ serviceType: String) {
    let key = serviceType.trimmingCharacters(in: .whitespacesAndNewlines)
    sessionsQueue.sync {
      if let session = sessionsByType.removeValue(forKey: key) {
        session.stop()
      }
    }
  }

  // MARK: - Internal: event emission

  fileprivate func emitDeviceFound(
    serviceType: String,
    nodeId: String,
    serviceName: String,
    baseUrl: String,
    host: String,
    port: Int,
    txt: [String: String]
  ) {
    guard !nodeId.isEmpty, !baseUrl.isEmpty else {
      NSLog(
        "[ESPDiscoveryModule] emitDeviceFound dropped: empty nodeId or baseUrl (type=%@ name=%@)",
        serviceType, serviceName
      )
      return
    }
    var eventData: [String: Any] = [
      "serviceType": serviceType,
      "nodeId": nodeId,
      "serviceName": serviceName,
      "baseUrl": baseUrl,
      "host": host,
      "port": port,
      "txt": txt,
    ]
    attachMatterFields(into: &eventData, serviceType: serviceType, serviceName: serviceName)
    NSLog(
      "[ESPDiscoveryModule] emit DiscoveryUpdate type=%@ name=%@ host=%@ port=%d matterNodeId=%@ compressedFabricId=%@",
      serviceType,
      serviceName,
      host,
      port,
      (eventData["matterNodeId"] as? String) ?? "<nil>",
      (eventData["compressedFabricId"] as? String) ?? "<nil>"
    )
    sendEvent(withName: "DiscoveryUpdate", body: eventData)
  }

  fileprivate func emitDeviceLost(serviceType: String, nodeId: String, serviceName: String) {
    var eventData: [String: Any] = [
      "serviceType": serviceType,
      "nodeId": nodeId,
      "serviceName": serviceName,
    ]
    attachMatterFields(into: &eventData, serviceType: serviceType, serviceName: serviceName)
    NSLog(
      "[ESPDiscoveryModule][LOST_EVENT] emit DiscoveryLost type=%@ nodeId=%@ name=%@",
      serviceType, nodeId, serviceName
    )
    sendEvent(withName: "DiscoveryLost", body: eventData)
  }

  /// For `_matter._tcp.` events, derive `matterNodeId` + `compressedFabricId` from the
  /// service instance name. RainMaker types are unaffected.
  ///
  /// Matter spec ("Operational Discovery") defines the instance name as
  /// `<CompressedFabricId16Hex>-<MatterNodeId16Hex>`. Both halves are exactly 16 hex characters.
  private func attachMatterFields(
    into payload: inout [String: Any],
    serviceType: String,
    serviceName: String
  ) {
    let stripped = serviceType.trimmingCharacters(in: CharacterSet(charactersIn: "."))
    let target = kMatterOperationalServiceType.trimmingCharacters(in: CharacterSet(charactersIn: "."))
    guard stripped == target else { return }
    let parts = serviceName.split(separator: "-")
    guard parts.count == 2,
          parts[0].count == 16, parts[1].count == 16,
          parts[0].allSatisfy({ $0.isHexDigit }),
          parts[1].allSatisfy({ $0.isHexDigit })
    else {
      NSLog(
        "[ESPDiscoveryModule] attachMatterFields: instance name does not match Matter operational format (name=%@)",
        serviceName
      )
      return
    }
    payload["matterNodeId"] = String(parts[1]).lowercased()
    payload["compressedFabricId"] = String(parts[0]).lowercased()
    NSLog(
      "[ESPDiscoveryModule] attachMatterFields: parsed matterNodeId=%@ compressedFabricId=%@ from name=%@",
      String(parts[1]).lowercased(),
      String(parts[0]).lowercased(),
      serviceName
    )
  }
}

// MARK: - BrowseSession

/// Owns the per-service-type Bonjour state. Slow Matter resolves never block RainMaker
/// resolves because each session has its own browser/delegate/queue.
private final class BrowseSession: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
  let serviceType: String
  let domain: String
  weak var owner: ESPDiscoveryModule?

  private let browser = NetServiceBrowser()
  private var servicesBeingResolved: [NetService] = []
  /// Stable node id for `DiscoveryLost` when TXT `node_id` differs from instance name.
  private var resolvedNodeIdByServiceKey: [String: String] = [:]

  init(serviceType: String, domain: String, owner: ESPDiscoveryModule) {
    self.serviceType = serviceType
    self.domain = domain
    self.owner = owner
    super.init()
    browser.delegate = self
  }

  /// `NetServiceBrowser` delivers delegate callbacks on the run loop of the thread
  /// that called `searchForServices`. React Native dispatches module methods on a
  /// background `methodQueue`, whose thread has no run loop being driven — so
  /// `willSearch` fires (it's posted synchronously) but `didFind` / `didResolveAddress`
  /// never do, and discovery silently produces zero results. Pin browse + resolve to
  /// the main run loop so the callbacks always fire.
  func start() {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      NSLog("ESPDiscoveryModule: BrowseSession.start type=%@ domain=%@", self.serviceType, self.domain)
      self.browser.schedule(in: RunLoop.main, forMode: .common)
      self.browser.searchForServices(ofType: self.serviceType, inDomain: self.domain)
    }
  }

  func stop() {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      NSLog("ESPDiscoveryModule: BrowseSession.stop type=%@", self.serviceType)
      self.browser.stop()
      for service in self.servicesBeingResolved {
        service.stop()
      }
      self.servicesBeingResolved.removeAll()
      self.resolvedNodeIdByServiceKey.removeAll()
    }
  }

  // MARK: NetServiceBrowserDelegate

  func netServiceBrowser(_: NetServiceBrowser, didFind service: NetService, moreComing _: Bool) {
    NSLog(
      "ESPDiscoveryModule: didFind type=%@ name=%@ domain=%@",
      service.type, service.name, service.domain
    )
    service.delegate = self
    service.schedule(in: RunLoop.main, forMode: .common)
    servicesBeingResolved.append(service)
    service.resolve(withTimeout: 5.0)
  }

  func netServiceBrowser(_: NetServiceBrowser, didNotSearch errorDict: [String: NSNumber]) {
    NSLog(
      "ESPDiscoveryModule: didNotSearch type=%@ error=%@",
      serviceType, String(describing: errorDict)
    )
  }

  func netServiceBrowserWillSearch(_: NetServiceBrowser) {
    NSLog("ESPDiscoveryModule: willSearch type=%@", serviceType)
  }

  func netServiceBrowser(_: NetServiceBrowser, didRemove service: NetService, moreComing: Bool) {
    NSLog(
      "[ESPDiscoveryModule][LOST_EVENT] didRemove FIRED session=%@ name=%@ type=%@ domain=%@ moreComing=%@",
      serviceType, service.name, service.type, service.domain, moreComing ? "true" : "false"
    )
    servicesBeingResolved.removeAll {
      $0.name == service.name && $0.type == service.type && $0.domain == service.domain
    }
    let key = Self.serviceKey(service)
    let nodeId = resolvedNodeIdByServiceKey.removeValue(forKey: key) ?? service.name
    if !nodeId.isEmpty {
      owner?.emitDeviceLost(serviceType: serviceType, nodeId: nodeId, serviceName: service.name)
    } else {
      NSLog(
        "[ESPDiscoveryModule][LOST_EVENT] didRemove dropped: empty nodeId for session=%@ name=%@",
        serviceType, service.name
      )
    }
  }

  // MARK: NetServiceDelegate

  func netServiceDidResolveAddress(_ sender: NetService) {
    let txt = txtRecordDictionary(sender)
    var nodeId = nodeIdFromTxtRecord(txt)
    if nodeId.isEmpty {
      nodeId = sender.name
    }
    guard !nodeId.isEmpty else {
      NSLog("ESPDiscoveryModule: Could not determine node id (type=%@)", serviceType)
      return
    }

    let hostForUrl = numericHostString(from: sender)
      ?? sender.hostName.map { $0.hasSuffix(".") ? String($0.dropLast()) : $0 }
    guard let host = hostForUrl, !host.isEmpty else {
      NSLog("ESPDiscoveryModule: Invalid host after resolve (type=%@)", serviceType)
      return
    }

    let baseUrl = "http://\(host):\(sender.port)"
    NSLog(
      "ESPDiscoveryModule: didResolve type=%@ name=%@ host=%@ port=%d",
      serviceType, sender.name, host, sender.port
    )
    resolvedNodeIdByServiceKey[Self.serviceKey(sender)] = nodeId
    owner?.emitDeviceFound(
      serviceType: serviceType,
      nodeId: nodeId,
      serviceName: sender.name,
      baseUrl: baseUrl,
      host: host,
      port: sender.port,
      txt: txt
    )
  }

  func netService(_ sender: NetService, didNotResolve errorDict: [String: NSNumber]) {
    NSLog(
      "ESPDiscoveryModule: Failed to resolve type=%@ name=%@ error=%@",
      serviceType, sender.name, String(describing: errorDict)
    )
  }

  // MARK: Helpers

  private static func serviceKey(_ service: NetService) -> String {
    "\(service.name)|\(service.type)|\(service.domain)"
  }

  /// Bonjour TXT `node_id` (case-insensitive), same as Android `mDNSManager`.
  private func nodeIdFromTxtRecord(_ txt: [String: String]) -> String {
    for (key, value) in txt where key.lowercased() == "node_id" {
      let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
      if !trimmed.isEmpty { return trimmed }
    }
    return ""
  }

  /// Decode TXT record into a `[String: String]` of UTF-8 values.
  private func txtRecordDictionary(_ service: NetService) -> [String: String] {
    guard let txtData = service.txtRecordData() else { return [:] }
    let raw = NetService.dictionary(fromTXTRecord: txtData)
    var out: [String: String] = [:]
    for (key, valueData) in raw {
      if let value = String(data: valueData, encoding: .utf8) {
        out[key] = value
      }
    }
    return out
  }

  /// Prefer numeric IP for `baseUrl` to match Android `InetAddress.getHostAddress()`.
  private func numericHostString(from service: NetService) -> String? {
    guard let addresses = service.addresses else { return nil }
    for data in addresses {
      let host: String? = data.withUnsafeBytes { buf -> String? in
        guard let base = buf.baseAddress else { return nil }
        var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
        let saLen = socklen_t(data.count)
        let rc = getnameinfo(
          base.assumingMemoryBound(to: sockaddr.self),
          saLen,
          &hostname,
          socklen_t(hostname.count),
          nil,
          0,
          NI_NUMERICHOST
        )
        guard rc == 0 else { return nil }
        return String(cString: hostname)
      }
      if let h = host, !h.isEmpty { return h }
    }
    return nil
  }
}
