/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation
import React

@objc(ESPDiscoveryModule)
class ESPDiscoveryModule: RCTEventEmitter {
  
  private var serviceBrowser = NetServiceBrowser()
  private var servicesBeingResolved: [NetService] = []
  
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
    return ["DiscoveryUpdate"]
  }
  /// Starts the discovery process for network services.
  ///
  /// - Parameter params: A dictionary containing the following keys:
  ///   - `serviceType`: A `String` specifying the type of service to discover (e.g., "_http._tcp.").
  ///   - `domain`: A `String` specifying the domain in which to search for services (e.g., "local.").
  ///
  @objc(startDiscovery:)
  func startDiscovery(params: NSDictionary) {
    
    // Extract the service type and domain from the provided dictionary.
    if let serviceType = params["serviceType"] as? String, let domain = params["domain"] as? String {
      // Clear any services that are currently being resolved to avoid conflicts.
      servicesBeingResolved.removeAll()
      
      // Stop any ongoing service browsing to ensure a fresh search.
      serviceBrowser.stop()
      
      // Start searching for services of the specified type in the given domain.
      serviceBrowser.searchForServices(ofType: serviceType, inDomain: domain)
    } else {
      print("ESPDiscoveryModule: Invalid parameters - serviceType or domain missing")
    }
  }
  
  /// Stops the ongoing discovery process.
  @objc(stopDiscovery)
  func stopDiscovery() {
    // Stop the service browser to terminate the discovery process.
    serviceBrowser.stop()
    // Clear resolved services
    servicesBeingResolved.removeAll()
  }
  
  private func sendDeviceEvent(nodeId: String, baseUrl: String) {
    // Validate inputs before sending event
    guard !nodeId.isEmpty, !baseUrl.isEmpty else {
      return
    }
    
    let eventData: [String: Any] = ["nodeId": nodeId, "baseUrl": baseUrl]
    sendEvent(withName: "DiscoveryUpdate", body: eventData)
  }
  
}

extension ESPDiscoveryModule: NetServiceBrowserDelegate {
  func netServiceBrowser(_: NetServiceBrowser, didFind service: NetService, moreComing _: Bool) {
    service.delegate = self
    servicesBeingResolved.append(service)
    service.resolve(withTimeout: 5.0)
  }
}

extension ESPDiscoveryModule: NetServiceDelegate {
  func netServiceDidResolveAddress(_ sender: NetService) {
    // Extract nodeId and base URL from service name or other attributes
    guard let hostname = sender.hostName, !hostname.isEmpty else {
      print("ESPDiscoveryModule: Invalid hostname, cannot resolve service")
      return
    }
    
    var nodeId = hostname
    if hostname.contains(".") {
      if let endIndex = hostname.range(of: ".")?.lowerBound {
        nodeId = String(hostname[..<endIndex])
      }
    }
    
    let baseUrl = "\(hostname):\(sender.port)"
    sendDeviceEvent(nodeId: nodeId, baseUrl: baseUrl)
  }
  
  func netService(_ sender: NetService, didNotResolve errorDict: [String: NSNumber]) {
    print("ESPDiscoveryModule: Failed to resolve service: \(errorDict)")
  }
}
