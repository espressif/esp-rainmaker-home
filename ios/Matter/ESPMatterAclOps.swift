/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation
import Matter

/// Stateless helpers for the Access Control cluster's ACL attribute on endpoint 0.
///
/// Shared by the commissioning-time operate-CAT grant
/// (`ESPMatterModule.writeOperateCatAclIfNeeded`) and the post-rotation repair
/// (`ESPMatterModule.matterUpdateCatAclSubject`), so the two paths cannot drift
/// in how they read, match, build or write entries.
///
/// Entries stay in the `MTRDataValueDictionary` shape `readAttributes` returns,
/// so a list read here can be edited in place and handed straight back to
/// `writeEntries`. The default read is fabric-filtered and an ACL write replaces
/// the fabric's whole list, so every helper operates on this fabric's entries only.
enum ESPMatterAclOps {

  // MARK: - Types

  /// Where a CAT subject sits inside an ACL entry list.
  struct SubjectMatch {
    let entryIndex: Int
    let fieldIndex: Int
    let subjectIndex: Int
    /// The subject value found at that position.
    let value: UInt64
  }

  /// `authMode` and `fabricIndex` copied off the fabric's admin entry so a new
  /// entry joins the same fabric under the same auth mode.
  struct AdminEntryContext {
    let authMode: UInt64
    let fabricIndex: UInt64

    /// Used when the fabric's list carries no admin entry to copy from.
    static let fallback = AdminEntryContext(authMode: ESPMatterConstants.aclAuthModeCase,
                                            fabricIndex: 0)
  }

  // MARK: - Attribute path

  static let endpointId = NSNumber(value: 0)
  static let clusterId = NSNumber(value: ESPMatterConstants.accessControlClusterId)
  static let attributeId = NSNumber(value: ESPMatterConstants.aclAttributeId)

  // MARK: - Subjects

  /// Backend allocates operate CAT identifiers in this range; admin CATs fall outside it.
  private static let operateCatIdentifierRange: ClosedRange<UInt64> = 0x0600...0x08FF

  /// Builds the ACL subject for a CAT (`0xFFFFFFFD` + CAT id).
  ///
  /// - Parameter catIdHex: The CAT id as hex, with or without a `0x` prefix.
  /// - Returns: The subject value, or `nil` when the id is not valid hex.
  static func subject(fromCatIdHex catIdHex: String) -> UInt64? {
    let cleaned = catIdHex.hasPrefix("0x") || catIdHex.hasPrefix("0X")
      ? String(catIdHex.dropFirst(2))
      : catIdHex
    return (ESPMatterConstants.prefixCATId + cleaned).hexToDecimal
  }

  /// The CAT identifier of a subject: the 16 bits above the version.
  static func catIdentifier(of subject: UInt64) -> UInt64 {
    (subject >> 16) & 0xFFFF
  }

  /// Whether a CAT subject's identifier is in the operate range.
  static func isOperateCatSubject(_ subject: UInt64) -> Bool {
    operateCatIdentifierRange.contains(catIdentifier(of: subject))
  }

  /// Whether two subjects name the same CAT. A rotation keeps the identifier and
  /// only bumps the version, so matching on everything above the version treats a
  /// stale version as the same grant.
  static func sharesCatIdentifier(_ lhs: UInt64, _ rhs: UInt64) -> Bool {
    (lhs >> 16) == (rhs >> 16)
  }

  // MARK: - Read / Write

  /// Reads this fabric's ACL entries from endpoint 0.
  ///
  /// - Parameters:
  ///   - device: The device to read from.
  ///   - queue: Queue the completion runs on.
  ///   - completion: The fabric's entry list, or the read error. A report without an
  ///     array payload yields an empty list, not an error.
  static func readEntries(device: MTRBaseDevice,
                          queue: DispatchQueue,
                          completion: @escaping (Result<[[String: Any]], Error>) -> Void) {
    device.readAttributes(withEndpointID: endpointId,
                          clusterID: clusterId,
                          attributeID: attributeId,
                          params: nil,
                          queue: queue) { values, error in
      if let error = error {
        completion(.failure(error))
        return
      }
      guard let values = values else {
        completion(.failure(NSError(domain: ESPMatterConstants.moduleDomain, code: -1, userInfo: [
          NSLocalizedDescriptionKey: ESPMatterConstants.aclReadReturnedNoData
        ])))
        return
      }
      completion(.success(entries(fromReports: values)))
    }
  }

  /// Replaces this fabric's ACL entries on endpoint 0.
  ///
  /// - Parameters:
  ///   - entries: The complete entry list to write; the device drops anything not in it.
  ///   - device: The device to write to.
  ///   - queue: Queue the completion runs on.
  ///   - completion: `nil` on success, otherwise the write error.
  static func writeEntries(_ entries: [[String: Any]],
                           device: MTRBaseDevice,
                           queue: DispatchQueue,
                           completion: @escaping (Error?) -> Void) {
    let aclValue: [String: Any] = [
      ESPMatterConstants.type: ESPMatterConstants.arrayType,
      ESPMatterConstants.value: entries
    ]
    device.writeAttribute(withEndpointID: endpointId,
                          clusterID: clusterId,
                          attributeID: attributeId,
                          value: aclValue,
                          timedWriteTimeout: nil,
                          queue: queue) { _, error in
      completion(error)
    }
  }

  /// Pulls the ACL entry list out of a `readAttributes` report array.
  static func entries(fromReports reports: [[String: Any]]) -> [[String: Any]] {
    for report in reports {
      if let data = report[ESPMatterConstants.data] as? [String: Any],
         (data[ESPMatterConstants.type] as? String) == ESPMatterConstants.arrayType,
         let items = data[ESPMatterConstants.value] as? [[String: Any]] {
        return items
      }
    }
    return []
  }

  // MARK: - Inspect

  /// Finds every subject in the list that names the same CAT as `subject`.
  ///
  /// - Parameters:
  ///   - subject: The CAT subject to match by identifier.
  ///   - entries: The fabric's entry list.
  /// - Returns: One match per subject position, in list order.
  static func findSubjects(sharingIdentifierWith subject: UInt64,
                           in entries: [[String: Any]]) -> [SubjectMatch] {
    var matches: [SubjectMatch] = []
    for (entryIndex, entry) in entries.enumerated() {
      guard let fields = fields(of: entry) else { continue }
      for (fieldIndex, field) in fields.enumerated() {
        guard tag(of: field) == ESPMatterConstants.aclSubjectsTag,
              let subjectItems = subjectItems(of: field) else { continue }
        for (subjectIndex, item) in subjectItems.enumerated() {
          guard let value = unsignedValue(of: item),
                sharesCatIdentifier(value, subject) else { continue }
          matches.append(SubjectMatch(entryIndex: entryIndex,
                                      fieldIndex: fieldIndex,
                                      subjectIndex: subjectIndex,
                                      value: value))
        }
      }
    }
    return matches
  }

  /// The first subject in the list that names the same CAT as `subject`, if any.
  static func findSubject(sharingIdentifierWith subject: UInt64,
                          in entries: [[String: Any]]) -> SubjectMatch? {
    findSubjects(sharingIdentifierWith: subject, in: entries).first
  }

  /// `authMode` and `fabricIndex` of the fabric's first admin entry.
  ///
  /// - Parameter entries: The fabric's entry list.
  /// - Returns: The admin entry's context, or `nil` when the list has no admin entry.
  static func extractAdminEntryContext(from entries: [[String: Any]]) -> AdminEntryContext? {
    for entry in entries {
      guard let fields = fields(of: entry) else { continue }
      var privilege: UInt64?
      var authMode: UInt64?
      var fabricIndex: UInt64?
      for field in fields {
        guard let tag = tag(of: field), let number = unsignedValue(of: field) else { continue }
        switch tag {
        case ESPMatterConstants.aclPrivilegeTag: privilege = number
        case ESPMatterConstants.aclAuthModeTag: authMode = number
        case ESPMatterConstants.aclFabricIndexTag: fabricIndex = number
        default: break
        }
      }
      if privilege == ESPMatterConstants.aclPrivilegeAdmin {
        return AdminEntryContext(authMode: authMode ?? AdminEntryContext.fallback.authMode,
                                 fabricIndex: fabricIndex ?? AdminEntryContext.fallback.fabricIndex)
      }
    }
    return nil
  }

  // MARK: - Build / Edit

  /// Builds an Operate entry granting `subject` on every endpoint and cluster.
  ///
  /// - Parameters:
  ///   - subject: The CAT subject to grant.
  ///   - authMode: Auth mode copied from the fabric's admin entry.
  ///   - fabricIndex: Fabric index copied from the fabric's admin entry.
  /// - Returns: The entry in the list-item shape `writeEntries` expects.
  static func makeOperateEntry(subject: UInt64,
                               authMode: UInt64,
                               fabricIndex: UInt64) -> [String: Any] {
    let subjectsValue: [String: Any] = [
      ESPMatterConstants.type: ESPMatterConstants.arrayType,
      ESPMatterConstants.value: [[ESPMatterConstants.data: unsignedValue(subject)]]
    ]
    let nullValue: [String: Any] = [ESPMatterConstants.type: ESPMatterConstants.nullType]
    let entryFields: [[String: Any]] = [
      field(ESPMatterConstants.aclPrivilegeTag, unsignedValue(ESPMatterConstants.aclPrivilegeOperate)),
      field(ESPMatterConstants.aclAuthModeTag, unsignedValue(authMode)),
      field(ESPMatterConstants.aclSubjectsTag, subjectsValue),
      field(ESPMatterConstants.aclTargetsTag, nullValue),
      field(ESPMatterConstants.aclFabricIndexTag, unsignedValue(fabricIndex))
    ]
    let entryStructure: [String: Any] = [
      ESPMatterConstants.type: ESPMatterConstants.structureType,
      ESPMatterConstants.value: entryFields
    ]
    return [ESPMatterConstants.data: entryStructure]
  }

  /// Returns a copy of `entries` with the subject at `match` set to `newSubject`.
  ///
  /// - Parameters:
  ///   - match: Position from `findSubjects(sharingIdentifierWith:in:)` on the same list.
  ///   - newSubject: The subject value to store there.
  ///   - entries: The fabric's entry list.
  /// - Returns: The edited list, or `entries` unchanged if the position no longer resolves.
  static func replacingSubject(at match: SubjectMatch,
                               with newSubject: UInt64,
                               in entries: [[String: Any]]) -> [[String: Any]] {
    guard entries.indices.contains(match.entryIndex),
          var structure = entries[match.entryIndex][ESPMatterConstants.data] as? [String: Any],
          var fields = structure[ESPMatterConstants.value] as? [[String: Any]],
          fields.indices.contains(match.fieldIndex),
          var subjectsField = fields[match.fieldIndex][ESPMatterConstants.data] as? [String: Any],
          var subjectItems = subjectsField[ESPMatterConstants.value] as? [[String: Any]],
          subjectItems.indices.contains(match.subjectIndex) else {
      return entries
    }
    subjectItems[match.subjectIndex] = [ESPMatterConstants.data: unsignedValue(newSubject)]
    subjectsField[ESPMatterConstants.value] = subjectItems
    fields[match.fieldIndex] = field(ESPMatterConstants.aclSubjectsTag, subjectsField)
    structure[ESPMatterConstants.value] = fields
    var updated = entries
    updated[match.entryIndex] = [ESPMatterConstants.data: structure]
    return updated
  }

  // MARK: - Data-value plumbing

  private static func unsignedValue(_ value: UInt64) -> [String: Any] {
    [ESPMatterConstants.type: ESPMatterConstants.unsignedIntegerType,
     ESPMatterConstants.value: NSNumber(value: value)]
  }

  private static func field(_ tag: Int, _ data: [String: Any]) -> [String: Any] {
    [ESPMatterConstants.contextTag: NSNumber(value: tag),
     ESPMatterConstants.data: data]
  }

  /// The context-tagged fields of a structure-typed list item.
  private static func fields(of entry: [String: Any]) -> [[String: Any]]? {
    guard let structure = entry[ESPMatterConstants.data] as? [String: Any] else { return nil }
    return structure[ESPMatterConstants.value] as? [[String: Any]]
  }

  private static func tag(of field: [String: Any]) -> Int? {
    (field[ESPMatterConstants.contextTag] as? NSNumber)?.intValue
  }

  /// The unsigned payload of a field or list item, when it carries one.
  private static func unsignedValue(of item: [String: Any]) -> UInt64? {
    guard let data = item[ESPMatterConstants.data] as? [String: Any] else { return nil }
    return (data[ESPMatterConstants.value] as? NSNumber)?.uint64Value
  }

  /// The list items of an array-typed `subjects` field.
  private static func subjectItems(of field: [String: Any]) -> [[String: Any]]? {
    guard let data = field[ESPMatterConstants.data] as? [String: Any],
          (data[ESPMatterConstants.type] as? String) == ESPMatterConstants.arrayType else {
      return nil
    }
    return data[ESPMatterConstants.value] as? [[String: Any]]
  }
}
