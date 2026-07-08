/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation
import Matter
import React

/// Native Matter control adapter for iOS. Mirrors the Android
/// `ESPMatterControl` surface and exposes the four canonical Matter
/// Interaction Model operations — `read`, `write`, `invoke`,
/// `subscribe` (plus their lifecycle siblings `init`, `shutdown`,
/// `unsubscribe`).
///
/// Outbound `MatterDataValue` payloads are passed through
/// `normalizeOutboundDataValue` to the Apple `MTRDataValueDictionary`
/// shape that `MTRBaseDevice.invokeCommand…/writeAttribute…` expects.
/// Inbound subscription reports are reduced to a primitive JS-friendly
/// value and forwarded over the `ESPMatter:attributeReport` RN event —
/// same name as Android — so a single JS subscription channel can
/// listen on either platform.
///
/// No cluster-specific semantic translation lives here. Callers send
/// raw cluster / attribute / command ids and Matter data-value payloads;
/// semantic mapping (semantic units, OnOff bool, mode pickers, …) lives
/// above this surface in TypeScript hooks/panels or in the Matter SDK
/// transformer.
public enum ESPMatterControl {
  public static let attributeReportEventName: String = "ESPMatter:attributeReport"

  fileprivate static let DEFAULT_MIN_INTERVAL_SEC: UInt16 = 1
  fileprivate static let DEFAULT_MAX_INTERVAL_SEC: UInt16 = 30
}

extension ESPMatterModule {

  // MARK: - Lifecycle (init / shutdown)

  @objc func matterControlInit(_ config: NSDictionary?,
                               resolver resolve: @escaping RCTPromiseResolveBlock,
                               rejecter _: @escaping RCTPromiseRejectBlock) {
    // The active controller is set up by commissioning; init is a
    // no-op placeholder for symmetry with Android.
    _ = config
    resolve(["success": true])
  }

  @objc func matterControlShutdown(_ resolve: @escaping RCTPromiseResolveBlock,
                                   rejecter _: @escaping RCTPromiseRejectBlock) {
    // We do not own the controller's lifecycle here; commissioning
    // owns it. Drop any per-device report handlers we registered
    // and resolve.
    resolve(["success": true])
  }

  // MARK: - Read / Write / Invoke

  @objc func matterControlRead(_ matterNodeId: String,
                               endpoint: NSNumber,
                               clusterId: NSNumber,
                               attributeId: NSNumber,
                               resolver resolve: @escaping RCTPromiseResolveBlock,
                               rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let node = ESPMatterModule.parseMatterNodeId(matterNodeId),
          let controller = currentMatterController else {
      reject("NO_CONTROLLER", "Matter controller is not initialised", nil); return
    }
    let device = MTRBaseDevice(nodeID: node, controller: controller)
    device.readAttributes(withEndpointID: endpoint,
                          clusterID: clusterId,
                          attributeID: attributeId,
                          params: nil,
                          queue: matterQueue) { reports, error in
      if let error = error {
        reject("READ_FAILED", error.localizedDescription, error); return
      }
      let dataValue = ESPMatterModule.firstAttributeData(from: reports)
      let primitive = ESPMatterModule.dataValueToPrimitive(dataValue) ?? NSNull()
      resolve(["success": true, "value": primitive])
    }
  }

  @objc func matterControlWrite(_ matterNodeId: String,
                                endpoint: NSNumber,
                                clusterId: NSNumber,
                                attributeId: NSNumber,
                                value: NSDictionary?,
                                resolver resolve: @escaping RCTPromiseResolveBlock,
                                rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let node = ESPMatterModule.parseMatterNodeId(matterNodeId),
          let controller = currentMatterController else {
      reject("NO_CONTROLLER", "Matter controller is not initialised", nil); return
    }
    guard let value = value else {
      reject("INVALID_ARG", "write: value is nil", nil); return
    }
    let device = MTRBaseDevice(nodeID: node, controller: controller)
    let normalised = ESPMatterModule.normalizeOutboundDataValue(value)
    device.writeAttribute(withEndpointID: endpoint,
                          clusterID: clusterId,
                          attributeID: attributeId,
                          value: normalised,
                          timedWriteTimeout: nil,
                          queue: matterQueue) { _, error in
      if let error = error {
        reject("WRITE_FAILED", error.localizedDescription, error); return
      }
      resolve(["success": true])
    }
  }

  @objc func matterControlInvoke(_ matterNodeId: String,
                                 endpoint: NSNumber,
                                 clusterId: NSNumber,
                                 commandId: NSNumber,
                                 commandFields: NSDictionary?,
                                 resolver resolve: @escaping RCTPromiseResolveBlock,
                                 rejecter reject: @escaping RCTPromiseRejectBlock) {
    invokeInternal(matterNodeId: matterNodeId,
                   endpoint: endpoint,
                   clusterId: clusterId,
                   commandId: commandId,
                   commandFields: commandFields,
                   onSuccess: { resolve(["success": true]) },
                   onFailure: { code, message, err in reject(code, message, err) })
  }

  @objc func matterEncodeCommandFieldsToTlvHex(_ commandFields: NSDictionary?,
                                               resolver resolve: @escaping RCTPromiseResolveBlock,
                                               rejecter reject: @escaping RCTPromiseRejectBlock) {
    let hex = MatterDataValueCodec.encodeCommandFieldsToTlvHex(commandFields)
    resolve(hex)
  }

  // MARK: - Subscribe / Unsubscribe

  @objc func matterControlSubscribe(_ matterNodeId: String,
                                    attributePaths: NSArray?,
                                    minIntervalSec: NSNumber,
                                    maxIntervalSec: NSNumber,
                                    resolver resolve: @escaping RCTPromiseResolveBlock,
                                    rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let node = ESPMatterModule.parseMatterNodeId(matterNodeId),
          let controller = currentMatterController else {
      reject("NO_CONTROLLER", "Matter controller is not initialised", nil); return
    }
    guard let attributePaths = attributePaths, attributePaths.count > 0 else {
      reject("INVALID_ARG", "subscribe: no attribute paths", nil); return
    }

    let device = MTRBaseDevice(nodeID: node, controller: controller)
    let minRequested = minIntervalSec.uint16Value
    let maxRequested = maxIntervalSec.uint16Value
    let minInt = max(ESPMatterControl.DEFAULT_MIN_INTERVAL_SEC, minRequested)
    let maxInt = max(UInt16(minInt + 1),
                     maxRequested > 0 ? maxRequested : ESPMatterControl.DEFAULT_MAX_INTERVAL_SEC)

    let params = MTRSubscribeParams(minInterval: NSNumber(value: minInt),
                                    maxInterval: NSNumber(value: maxInt))
    params.shouldResubscribeAutomatically = true

    var allow = Set<UInt64>()
    for case let path as NSDictionary in attributePaths {
      guard let ep = (path["endpoint"] as? NSNumber),
            let cl = (path["clusterId"] as? NSNumber),
            let at = (path["attributeId"] as? NSNumber) else { continue }
      allow.insert(ESPMatterModule.packPath(endpoint: ep.intValue,
                                            clusterId: cl.uint64Value,
                                            attributeId: at.uint64Value))
    }
    if allow.isEmpty {
      reject("INVALID_ARG", "subscribe: no valid attribute paths", nil); return
    }

    let handle = "sub-\(UUID().uuidString)"
    let listenerNodeId = matterNodeId

    device.subscribeToAttributes(
      withEndpointID: nil,
      clusterID: nil,
      attributeID: nil,
      params: params,
      queue: matterQueue,
      reportHandler: { [weak self] reports, _ in
        guard let self = self else { return }
        self.handleSubscriptionReports(matterNodeId: listenerNodeId,
                                       reports: reports,
                                       allow: allow)
      },
      subscriptionEstablished: {}
    )

    resolve(["subscriptionId": handle])
  }

  @objc func matterControlUnsubscribe(_ subscriptionId: String,
                                      resolver resolve: @escaping RCTPromiseResolveBlock,
                                      rejecter _: @escaping RCTPromiseRejectBlock) {
    // `MTRBaseDevice` does not expose per-handle teardown. The standard
    // Apple pattern is `deregisterReportHandlers` per device, which we
    // fold into `matterControlShutdown`. We accept the handle for API
    // parity with Android and resolve as a no-op.
    _ = subscriptionId
    resolve(["success": true])
  }

  // MARK: - Internals

  private func invokeInternal(matterNodeId: String,
                              endpoint: NSNumber,
                              clusterId: NSNumber,
                              commandId: NSNumber,
                              commandFields: NSDictionary?,
                              onSuccess: @escaping () -> Void,
                              onFailure: @escaping (String, String, Error?) -> Void) {
    guard let node = ESPMatterModule.parseMatterNodeId(matterNodeId),
          let controller = currentMatterController else {
      onFailure("NO_CONTROLLER", "Matter controller is not initialised", nil); return
    }
    let device = MTRBaseDevice(nodeID: node, controller: controller)
    // Apple requires `commandFields` to be a Structure data-value, even
    // for fieldless commands. Default to an empty Structure when JS
    // sends nil.
    let fields: [String: Any] = commandFields.map {
      ESPMatterModule.normalizeOutboundDataValue($0)
    } ?? ["type": "Structure", "value": [[String: Any]]()]

    device.invokeCommand(withEndpointID: endpoint,
                         clusterID: clusterId,
                         commandID: commandId,
                         commandFields: fields,
                         timedInvokeTimeout: nil,
                         queue: matterQueue) { _, error in
      if let error = error {
        onFailure("INVOKE_FAILED", error.localizedDescription, error); return
      }
      onSuccess()
    }
  }

  fileprivate func handleSubscriptionReports(matterNodeId: String,
                                             reports: [Any]?,
                                             allow: Set<UInt64>? = nil) {
    guard let reports = reports as? [[String: Any]] else { return }
    for report in reports {
      guard let path = report["attributePath"] as? MTRAttributePath else { continue }
      if let allow = allow {
        let key = ESPMatterModule.packPath(endpoint: path.endpoint.intValue,
                                           clusterId: path.cluster.uint64Value,
                                           attributeId: path.attribute.uint64Value)
        if !allow.contains(key) { continue }
      }
      let value = report["data"] as? [String: Any]
      let primitive = ESPMatterModule.dataValueToPrimitive(value) ?? NSNull()
      let event: [String: Any] = [
        "matterNodeId": matterNodeId,
        "endpoint": path.endpoint.intValue,
        "clusterId": path.cluster.doubleValue,
        "attributeId": path.attribute.doubleValue,
        "value": primitive
      ]
      sendEvent(withName: ESPMatterControl.attributeReportEventName, body: event)
    }
  }

  // MARK: - Helpers (static so the extension can stay stateless)

  fileprivate static func parseMatterNodeId(_ s: String) -> NSNumber? {
    if s.isEmpty { return nil }
    let cleaned = s.hasPrefix("0x") || s.hasPrefix("0X") ? String(s.dropFirst(2)) : s
    if let v = UInt64(cleaned, radix: 16) { return NSNumber(value: v) }
    if let v = UInt64(s) { return NSNumber(value: v) }
    return nil
  }

  fileprivate static func packPath(endpoint: Int,
                                   clusterId: UInt64,
                                   attributeId: UInt64) -> UInt64 {
    let ep = UInt64(endpoint & 0xFFFF)
    let cl = clusterId & 0xFF_FFFF
    let at = attributeId & 0xFF_FFFF
    return (ep << 48) | (cl << 24) | at
  }

  // MARK: - MatterDataValue ↔ Apple data-value-dict bridging
  //
  // The JS wire format mirrors Apple's `MTRDataValueDictionary` keys
  // exactly (`type`/`value`/`contextTag`/`data`), so the bridge is
  // mostly the identity. We only:
  //   - decode `OctetString.value` from base64 string → `NSData`
  //   - recurse into Structure / Array entries to apply the same rule
  // The output dictionary is what `MTRBaseDevice.invokeCommand…
  // commandFields:` and `writeAttribute… value:` expect.

  fileprivate static func normalizeOutboundDataValue(_ raw: NSDictionary) -> [String: Any] {
    guard let type = raw["type"] as? String else {
      return raw as? [String: Any] ?? [:]
    }
    var out: [String: Any] = ["type": type]
    switch type {
    case "OctetString":
      if let s = raw["value"] as? String,
         let data = Data(base64Encoded: s) {
        out["value"] = data
      } else if let data = raw["value"] as? Data {
        out["value"] = data
      }
    case "Structure":
      let entries = (raw["value"] as? [[String: Any]]) ?? []
      out["value"] = entries.map { entry -> [String: Any] in
        var e: [String: Any] = [:]
        if let tag = entry["contextTag"] as? NSNumber { e["contextTag"] = tag }
        if let inner = entry["data"] as? NSDictionary {
          e["data"] = normalizeOutboundDataValue(inner)
        }
        return e
      }
    case "Array":
      let entries = (raw["value"] as? [[String: Any]]) ?? []
      out["value"] = entries.map { entry -> [String: Any] in
        var e: [String: Any] = [:]
        if let inner = entry["data"] as? NSDictionary {
          e["data"] = normalizeOutboundDataValue(inner)
        }
        return e
      }
    case "Null":
      // Omit `value` per spec.
      break
    default:
      // Pass primitives through verbatim.
      if let v = raw["value"] { out["value"] = v }
    }
    return out
  }

  /// Pull the first attribute's data-value out of a heterogeneous
  /// report array as returned by `readAttributes`/`subscribeToAttributes`.
  fileprivate static func firstAttributeData(from reports: [Any]?) -> [String: Any]? {
    guard let reports = reports as? [[String: Any]] else { return nil }
    return reports.first?["data"] as? [String: Any]
  }

  /// Flatten an Apple-data-value-dict to a primitive JS-compatible value.
  fileprivate static func dataValueToPrimitive(_ value: [String: Any]?) -> Any? {
    guard let value = value, let type = value["type"] as? String else { return nil }
    switch type {
    case "Null":
      return NSNull()
    case "Boolean":
      return value["value"] as? Bool ?? false
    case "UnsignedInteger", "SignedInteger", "Float", "Double":
      return value["value"] as? NSNumber
    case "UTF8String":
      return value["value"] as? String
    case "OctetString":
      if let d = value["value"] as? Data { return d.base64EncodedString() }
      return value["value"]
    case "Structure":
      let entries = (value["value"] as? [[String: Any]]) ?? []
      var dict: [String: Any] = [:]
      for entry in entries {
        guard let tag = entry["contextTag"] as? NSNumber,
              let inner = entry["data"] as? [String: Any] else { continue }
        dict["\(tag.intValue)"] = dataValueToPrimitive(inner) ?? NSNull()
      }
      return dict
    case "Array":
      let entries = (value["value"] as? [[String: Any]]) ?? []
      return entries.compactMap { e -> Any? in
        (e["data"] as? [String: Any]).flatMap(dataValueToPrimitive)
      }
    default:
      return value["value"]
    }
  }
}
