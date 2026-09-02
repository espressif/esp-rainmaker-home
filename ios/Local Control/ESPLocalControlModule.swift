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

  /// Protocomm endpoints of the local-control protocol a node speaks.
  ///
  /// Defaults to the legacy `esp_local_ctrl` paths; RainMaker Neo nodes are
  /// connected with the `rmaker_local_ctrl` paths supplied by the JS transport
  /// through `connect(options:)`.
  private struct LocalCtrlEndpoints {
    var sessionPath = "esp_local_ctrl/session"
    var versionPath = "esp_local_ctrl/version"
    /// Root key holding `sec_patch_ver` in the version response JSON.
    var versionKey = "local_ctrl"

    /// Reads the endpoints from the optional `options` map. Missing keys keep the
    /// legacy defaults, so callers that predate multi-protocol support are
    /// unaffected.
    init(options: NSDictionary?) {
      guard let options = options else { return }
      func read(_ key: String, _ fallback: String) -> String {
        guard let value = options[key] as? String,
              !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else { return fallback }
        return value
      }
      sessionPath = read("sessionPath", sessionPath)
      versionPath = read("versionPath", versionPath)
      versionKey = read("versionKey", versionKey)
    }
  }

  /// Per-node connection state captured at `connect()` time: the node's own
  /// `ESPDevice` (which holds its session/transport) plus the protocomm
  /// endpoints it was connected with.
  private struct LocalDeviceEntry {
    let device: ESPDevice
    let endpoints: LocalCtrlEndpoints
  }

  // All connection state lives on the per-node entries in this map. There is
  // deliberately NO module-wide device/session: a single shared `ESPDevice`
  // meant sendData(nodeA) could ride whichever node connected last, delivering
  // params to the wrong device.
  private var devicesByNodeId: [String: LocalDeviceEntry] = [:]

  /// Promise callbacks of `connect()` calls whose handshake is still in flight,
  /// keyed by node. A second `connect(nodeId)` arriving while a handshake for
  /// that node is pending joins the existing attempt instead of starting a
  /// parallel one.
  private var pendingConnects: [String: [(RCTPromiseResolveBlock, RCTPromiseRejectBlock)]] = [:]

  /// Guards `devicesByNodeId` and `pendingConnects`: RN method-queue calls and
  /// ESPProvision completion handlers touch them from different threads.
  private let stateLock = NSLock()

  private func entry(for nodeId: String) -> LocalDeviceEntry? {
    stateLock.lock()
    defer { stateLock.unlock() }
    return devicesByNodeId[nodeId]
  }

  private func setEntry(_ entry: LocalDeviceEntry, for nodeId: String) {
    stateLock.lock()
    defer { stateLock.unlock() }
    devicesByNodeId[nodeId] = entry
  }

  private func removeEntry(for nodeId: String) {
    stateLock.lock()
    defer { stateLock.unlock() }
    devicesByNodeId[nodeId] = nil
  }

  /// Registers a `connect()` waiter for `nodeId`. Returns `true` when a handshake
  /// for this node is already in flight — the new caller has joined it and the
  /// caller must NOT start another handshake.
  private func registerConnectWaiter(for nodeId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Bool {
    stateLock.lock()
    defer { stateLock.unlock() }
    if pendingConnects[nodeId] != nil {
      pendingConnects[nodeId]?.append((resolve, reject))
      return true
    }
    pendingConnects[nodeId] = [(resolve, reject)]
    return false
  }

  /// Removes and returns every waiter registered for `nodeId`, so the handshake
  /// outcome settles all of them exactly once.
  private func drainConnectWaiters(for nodeId: String) -> [(RCTPromiseResolveBlock, RCTPromiseRejectBlock)] {
    stateLock.lock()
    defer { stateLock.unlock() }
    let waiters = pendingConnects[nodeId] ?? []
    pendingConnects[nodeId] = nil
    return waiters
  }

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
  /// "Connected" means THIS node's own session is established — never another
  /// node's. Each node has its own `ESPDevice` entry, so the answer can't be
  /// satisfied by a session that actually belongs to a different device.
  ///
  /// - Parameters:
  ///   - nodeId: The identifier of the ESP device to check.
  ///   - resolve: A callback invoked with a Boolean value indicating the connection status:
  ///       - `true`: The device is connected, and a session is established.
  ///       - `false`: The device is either not connected or the session is not established.
  ///   - reject: A callback invoked with an error message if the check fails.
  @objc(isConnected:resolve:reject:)
  func isConnected(nodeId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    resolve(entry(for: nodeId)?.device.isSessionEstablished() ?? false)
  }

  /// Drops the cached session/credentials for `nodeId` so the next `connect()` re-handshakes
  /// with current credentials. Call on re-provision, PoP/IP change, or mDNS loss (wired from
  /// the JS `DISCOVERY_LOST` handler via `ESPLocalControlAdapter.disconnect`).
  ///
  /// ESPProvision caches `isSessionEstablished` once at handshake and never resets it (not on
  /// a failed send, and `ESPDevice.disconnect()` only tears down a softAP hotspot config), so
  /// we drop the node's entry outright to invalidate stale session/PoP/IP state. Only this
  /// node's entry is removed; other nodes' active sessions are untouched.
  @objc(disconnect:)
  func disconnect(nodeId: String) {
    removeEntry(for: nodeId)
  }

  /// Establishes a connection to an ESP device using the specified parameters.
  ///
  /// Calling this while a handshake for the same node is already in flight does
  /// NOT start a second handshake: the call joins the pending attempt and both
  /// promises settle with that attempt's outcome (a joiner's own parameters are
  /// ignored — call `disconnect(nodeId:)` first to force a fresh handshake with
  /// new credentials). Calling it while a session is already established always
  /// re-handshakes and, on success, atomically replaces the node's entry;
  /// in-flight `sendData` calls complete on the old session they captured.
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
  ///   - options: (Optional) Protocomm endpoints (`sessionPath`, `versionPath`, `versionKey`)
  ///     selecting the local-control protocol. Defaults to the legacy `esp_local_ctrl` endpoints.
  ///   - resolve: A callback invoked with a success response when the connection is established.
  ///   - reject: A callback invoked with an error message if the connection fails.
  @objc(connect:baseUrl:securityType:pop:username:options:resolve:reject:)
  func connect(nodeId: String, baseUrl: String, securityType: NSNumber, pop: String?, username: String?, options: NSDictionary?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let endpoints = LocalCtrlEndpoints(options: options)
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
    let device: ESPDevice
    switch securityType.intValue {
    case 1:
      // IMPORTANT: pass `""` (not `nil`) when POP isn't supplied. iOS
      // `ESPDevice.initialiseSession` treats `proofOfPossession == nil` as
      // "ask the delegate for POP" via `delegate?.getProofOfPossesion(...)`,
      // and we don't set a delegate — so a `nil` POP would hang the session
      // callback forever. An empty-string POP routes through
      // `initSecureSession(pop: "")` → `ESPSecurity1(proofOfPossession: "")`,
      // which matches Android's `Security1(null/empty)` path.
      device = ESPDevice(
        name: nodeId,
        security: .secure,
        transport: .softap,
        proofOfPossession: pop ?? ""
      )
    case 2:
      // Secure connection with proof of possession and username.
      if let pop = pop, let username = username {
        device = ESPDevice(name: nodeId, security: .secure, transport: .softap, proofOfPossession: pop, username: username)
      } else {
        reject("error", "Username or password is missing", nil)
        return
      }
    default:
      // Unsecure connection.
      device = ESPDevice(name: nodeId, security: .unsecure, transport: .softap)
    }

    // A handshake for this node is already in flight: join it instead of racing
    // a second one against the same device.
    if registerConnectWaiter(for: nodeId, resolve: resolve, reject: reject) {
      return
    }

    // Configure the transport layer for the ESPDevice. The session this device
    // establishes is bound to this transport (this node's own base URL) and is
    // stored on the node's map entry, so it can never serve another nodeId.
    device.espSoftApTransport = ESPSoftAPTransport(baseUrl: baseUrlForSoftApTransport(baseUrl))

    // Security2 IV scheme depends on firmware sec_patch_ver; probe it first.
    if securityType.intValue == 2 {
      fetchSecPatchVersion(device: device, endpoints: endpoints) { patchVersion in
        var prov: [String: Any] = ["sec_ver": ESPSecurity.secure2.rawValue]
        if let patchVersion = patchVersion {
          prov["sec_patch_ver"] = patchVersion
        }
        device.versionInfo = ["prov": prov] as NSDictionary
        self.establishSession(nodeId: nodeId, device: device, endpoints: endpoints)
      }
    } else {
      establishSession(nodeId: nodeId, device: device, endpoints: endpoints)
    }
  }

  /// Probes the node's version endpoint for `sec_patch_ver` (selects the
  /// Security 2 AES-GCM IV scheme). `sec_patch_ver` is OPTIONAL by design:
  /// pre-patch firmware doesn't report it at all, and omitting the key makes
  /// ESPProvision fall back to patch version 0 (the legacy scheme), which is
  /// exactly what that firmware speaks. So a missing/unreadable value must NOT
  /// fail the connection — a genuine mismatch is still caught, because the
  /// SRP6a handshake in `establishSession` fails and rejects the promise.
  private func fetchSecPatchVersion(device: ESPDevice, endpoints: LocalCtrlEndpoints, completion: @escaping (Int?) -> Void) {
    let versionKey = endpoints.versionKey
    device.espSoftApTransport.SendConfigData(path: endpoints.versionPath, data: Data("---".utf8)) { response, _ in
      guard
        let response = response,
        let json = try? JSONSerialization.jsonObject(with: response) as? [String: Any],
        let localCtrl = json[versionKey] as? [String: Any]
      else {
        completion(nil)
        return
      }
      completion(localCtrl["sec_patch_ver"] as? Int)
    }
  }

  private func establishSession(nodeId: String, device: ESPDevice, endpoints: LocalCtrlEndpoints) {
    device.initialiseSession(sessionPath: endpoints.sessionPath) { status in
      // Settle every connect() call that joined this handshake.
      let waiters = self.drainConnectWaiters(for: nodeId)
      switch status {
      case .connected:
        // Only a successfully handshaked device is published to the map, so
        // isConnected()/sendData() never see a half-connected entry.
        self.setEntry(LocalDeviceEntry(device: device, endpoints: endpoints), for: nodeId)
        waiters.forEach { resolve, _ in resolve(["status": "success"]) }
      case .failedToConnect(let eSPSessionError):
        waiters.forEach { _, reject in reject("error", eSPSessionError.description, nil) }
      case .disconnected:
        waiters.forEach { _, reject in reject("error", "Failed to establish session", nil) }
      }
    }
  }

  /// Sends data to the specified ESP device through a given path.
  ///
  /// The data goes out on the target node's own session — looked up by `nodeId`
  /// — so a concurrent `connect()` for a different node can never redirect it.
  ///
  /// - Parameters:
  ///   - nodeId: The identifier of the ESP device to send data to.
  ///   - path: The endpoint path where the data should be sent.
  ///   - data: The data to be sent, which must be a base64 encoded string.
  ///   - resolve: A callback invoked with the base64 encoded response data if the data is successfully sent.
  ///   - reject: A callback invoked with an error message if the data fails to send or if the data is not base64 encoded.``
  @objc(sendData:path:data:resolve:reject:)
  func sendData(nodeId: String, path: String, data: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard let entry = entry(for: nodeId) else {
      // No session for this node — tell JS so it runs connect() with this
      // node's own credentials instead of silently using another node's session.
      reject("DEVICE_NOT_FOUND", "Device with nodeId \(nodeId) not found", nil)
      return
    }
    let device = entry.device

    // Decode the base64 payload; reject rather than crash on malformed input.
    guard let payload = Data(base64Encoded: data) else {
      reject("error", "Data is not base64 encoded.", nil)
      return
    }

    var invoked = false
    device.sendData(path: path, data: payload, completionHandler: { data, error in
      // Prevent multiple callback invocations
      guard !invoked else { return }
      invoked = true

      // If an error occurred, reject the promise with the error description.
      if let error = error {
        // Session/transport failed (e.g. device rebooted after re-provision): drop
        // this node's entry so the next call's isConnected() is false and connect()
        // re-handshakes with current credentials instead of reusing the dead session.
        self.removeEntry(for: nodeId)
        reject("error", error.description, nil)
        return
      }

      // ESPProvision should never return nil data with a nil error, but the
      // types allow it — reject instead of force-unwrapping.
      guard let data = data else {
        reject("error", "No response data received.", nil)
        return
      }

      // Resolve the promise with the base64 encoded response data.
      resolve(data.base64EncodedString())
    })
  }
}
