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

@objc(ESPDiscoveryModule)
class ESPDiscoveryModule: RCTEventEmitter {
  
  private var serviceBrowser = NetServiceBrowser()
  private var servicesBeingResolved: [NetService] = []
  /// Matches Android `resolvedNsdServices` bookkeeping: stable node id for `DiscoveryLost` when TXT `node_id` ≠ instance name.
  private var resolvedNodeIdByServiceKey: [String: String] = [:]
  
  override init() {
    super.init(disabledObservation: ())
    // Ensure service browser is properly initialized
    serviceBrowser = NetServiceBrowser()
    serviceBrowser.delegate = self
  }
  
  override public static func moduleName() -> String {
    return "ESPDiscoveryModule"
  }
  
  // Required for RCTEventEmitter
  public override static func requiresMainQueueSetup() -> Bool {
    return true
  }
  
  override func supportedEvents() -> [String]! {
    return ["DiscoveryUpdate", "DiscoveryLost"]
  }
  /// Starts the discovery process for network services.
  ///
  /// - Parameter params: A dictionary containing the following keys:
  ///   - `serviceType`: RainMaker local control default `_esp_local_ctrl._tcp.` (from base SDK).
  ///   - `domain`: SDK sends `local`; Bonjour expects `local.` — normalized below.
  ///
  @objc(startDiscovery:)
  func startDiscovery(params: NSDictionary) {
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

    guard let st = serviceType, let dom = domain else { return }

    resolvedNodeIdByServiceKey.removeAll()
    servicesBeingResolved.removeAll()
    serviceBrowser.stop()
    serviceBrowser.searchForServices(ofType: st, inDomain: dom)
  }
  
  /// Stops the ongoing discovery process.
  @objc(stopDiscovery)
  func stopDiscovery() {
    // Stop the service browser to terminate the discovery process.
    serviceBrowser.stop()
    servicesBeingResolved.removeAll()
    resolvedNodeIdByServiceKey.removeAll()
  }
  
  /// Emits a `DiscoveryUpdate` event with full discovery payload.
  ///
  /// Backwards-compatible: existing consumers continue to read `nodeId`/`baseUrl`.
  /// Additional fields are populated from the resolved Bonjour service so JS can
  /// drive flows that need direct LAN HTTP communication (e.g. on-network
  /// challenge-response provisioning) without further native round-trips.
  ///
  /// - Parameters:
  ///   - nodeId: Stable id (TXT `node_id` if present, else service name).
  ///   - serviceName: Raw mDNS service instance name (always preserved
  ///                  separately from `nodeId` so the UI can show both).
  ///   - baseUrl: `http://<host>:<port>` for legacy local control flows.
  ///   - host: Numeric IP of the resolved service (preferred for HTTP).
  ///   - port: TCP port advertised by the service.
  ///   - txt: Raw TXT key/value dictionary (UTF-8 strings) from the service.
  private func sendDeviceEvent(
    nodeId: String,
    serviceName: String,
    baseUrl: String,
    host: String,
    port: Int,
    txt: [String: String]
  ) {
    guard !nodeId.isEmpty, !baseUrl.isEmpty else {
      return
    }

    let eventData: [String: Any] = [
      "nodeId": nodeId,
      "serviceName": serviceName,
      "baseUrl": baseUrl,
      "host": host,
      "port": port,
      "txt": txt,
    ]
    sendEvent(withName: "DiscoveryUpdate", body: eventData)
  }

}

extension ESPDiscoveryModule: NetServiceBrowserDelegate {
  func netServiceBrowser(_: NetServiceBrowser, didFind service: NetService, moreComing _: Bool) {
    service.delegate = self
    servicesBeingResolved.append(service)
    service.resolve(withTimeout: 5.0)
  }

  func netServiceBrowser(_: NetServiceBrowser, didRemove service: NetService, moreComing _: Bool) {
    NSLog("ESPDiscoveryModule: Service lost: name=%@ type=%@ domain=%@", service.name, service.type, service.domain)
    servicesBeingResolved.removeAll {
      $0.name == service.name && $0.type == service.type && $0.domain == service.domain
    }
    let key = Self.serviceKey(service)
    let nodeId = resolvedNodeIdByServiceKey.removeValue(forKey: key) ?? service.name
    if !nodeId.isEmpty {
      sendEvent(withName: "DiscoveryLost", body: ["nodeId": nodeId])
    }
  }
}

extension ESPDiscoveryModule: NetServiceDelegate {
  func netServiceDidResolveAddress(_ sender: NetService) {
    let txt = txtRecordDictionary(sender)
    var nodeId = nodeIdFromTxtRecord(txt)
    if nodeId.isEmpty {
      nodeId = sender.name
    }
    guard !nodeId.isEmpty else {
      NSLog("ESPDiscoveryModule: Could not determine node id for service")
      return
    }

    let hostForUrl = numericHostString(from: sender)
      ?? sender.hostName.map { $0.hasSuffix(".") ? String($0.dropLast()) : $0 }
    guard let host = hostForUrl, !host.isEmpty else {
      NSLog("ESPDiscoveryModule: Invalid host after resolve")
      return
    }

    let baseUrl = "http://\(host):\(sender.port)"
    resolvedNodeIdByServiceKey[Self.serviceKey(sender)] = nodeId
    sendDeviceEvent(
      nodeId: nodeId,
      serviceName: sender.name,
      baseUrl: baseUrl,
      host: host,
      port: sender.port,
      txt: txt
    )
  }
  
  func netService(_ sender: NetService, didNotResolve errorDict: [String: NSNumber]) {
    print("ESPDiscoveryModule: Failed to resolve service: \(errorDict)")
  }

  private static func serviceKey(_ service: NetService) -> String {
    "\(service.name)|\(service.type)|\(service.domain)"
  }

  /// Bonjour TXT `node_id` (case-insensitive), same as RainMaker Android `mDNSManager`.
  private func nodeIdFromTxtRecord(_ txt: [String: String]) -> String {
    for (key, value) in txt where key.lowercased() == "node_id" {
      let trimmed = value.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
      if !trimmed.isEmpty { return trimmed }
    }
    return ""
  }

  /// Decode TXT record into a `[String: String]` of UTF-8 values.
  ///
  /// Used both for `node_id` lookup and to surface TXT data (e.g. `pop_required`,
  /// `sec_version`, `ch_resp`) to the JS layer for on-network provisioning.
  /// Uses `txtRecordData` + `dictionary(fromTXTRecord:)` for broad availability.
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
