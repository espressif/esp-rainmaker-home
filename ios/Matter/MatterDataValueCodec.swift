/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Foundation

/// CHIP TLV encoder for Matter data-value dictionaries.
/// Mirrors Android `MatterDataValueCodec` so RMNG MQTT command payloads match across platforms.
enum MatterDataValueCodec {

  static func encodeCommandFieldsToTlv(_ value: NSDictionary?) -> Data {
    var writer = MatterTlvWriter()
    if let value = value {
      writeValue(&writer, tag: .anonymous, value: value)
    } else {
      writer.startStructure(.anonymous)
      writer.endContainer()
    }
    return writer.encoded()
  }

  static func encodeCommandFieldsToTlvHex(_ value: NSDictionary?) -> String {
    let bytes = encodeCommandFieldsToTlv(value)
    let hex = bytes.map { String(format: "%02x", $0) }.joined()
    return "0x\(hex)"
  }

  private static func writeValue(_ writer: inout MatterTlvWriter, tag: MatterTlvTag, value: NSDictionary?) {
    guard let value = value, let type = value["type"] as? String else {
      writer.putNull(tag)
      return
    }

    switch type {
    case "Null":
      writer.putNull(tag)
    case "Boolean":
      writer.putBool(tag, value["value"] as? Bool ?? false)
    case "UnsignedInteger":
      let n = (value["value"] as? NSNumber)?.uint64Value ?? 0
      writer.putUnsigned(tag, n)
    case "SignedInteger":
      let n = (value["value"] as? NSNumber)?.int64Value ?? 0
      writer.putSigned(tag, n)
    case "Float":
      let n = (value["value"] as? NSNumber)?.floatValue ?? 0
      writer.putFloat(tag, n)
    case "Double":
      let n = (value["value"] as? NSNumber)?.doubleValue ?? 0
      writer.putDouble(tag, n)
    case "UTF8String":
      writer.putUTF8String(tag, value["value"] as? String ?? "")
    case "OctetString":
      if let b64 = value["value"] as? String,
         let data = Data(base64Encoded: b64) {
        writer.putByteString(tag, data)
      } else if let data = value["value"] as? Data {
        writer.putByteString(tag, data)
      } else {
        writer.putByteString(tag, Data())
      }
    case "Structure":
      writer.startStructure(tag)
      let entries = (value["value"] as? [[String: Any]]) ?? []
      for entry in entries {
        let ctxTag = (entry["contextTag"] as? NSNumber)?.intValue ?? 0
        let inner = entry["data"] as? NSDictionary
        writeValue(&writer, tag: .context(ctxTag), value: inner)
      }
      writer.endContainer()
    case "Array":
      writer.startArray(tag)
      let entries = (value["value"] as? [[String: Any]]) ?? []
      for entry in entries {
        let inner = entry["data"] as? NSDictionary
        writeValue(&writer, tag: .anonymous, value: inner)
      }
      writer.endContainer()
    default:
      writer.putNull(tag)
    }
  }
}

// MARK: - TLV writer (CHIP Matter TLV — matches Android `matter.tlv.TlvWriter`)

private enum MatterTlvTag {
  case anonymous
  case context(Int)
}

private struct MatterTlvWriter {
  private var buffer = Data()

  mutating func encoded() -> Data { buffer }

  mutating func startStructure(_ tag: MatterTlvTag) {
    writeContainerHead(tag: tag, elementType: 0x15)
  }

  mutating func startArray(_ tag: MatterTlvTag) {
    writeContainerHead(tag: tag, elementType: 0x16)
  }

  mutating func endContainer() {
    buffer.append(0x18)
  }

  mutating func putNull(_ tag: MatterTlvTag) {
    writePrimitiveHead(tag: tag, elementType: 0x14)
  }

  mutating func putBool(_ tag: MatterTlvTag, _ value: Bool) {
    writePrimitiveHead(tag: tag, elementType: value ? 0x09 : 0x08)
  }

  mutating func putUnsigned(_ tag: MatterTlvTag, _ value: UInt64) {
    if value <= UInt64(UInt8.max) {
      writePrimitiveHead(tag: tag, elementType: 0x04)
      buffer.append(UInt8(value))
    } else if value <= UInt64(UInt16.max) {
      writePrimitiveHead(tag: tag, elementType: 0x05)
      appendUInt16(UInt16(value))
    } else if value <= UInt64(UInt32.max) {
      writePrimitiveHead(tag: tag, elementType: 0x06)
      appendUInt32(UInt32(value))
    } else {
      writePrimitiveHead(tag: tag, elementType: 0x07)
      appendUInt64(value)
    }
  }

  mutating func putSigned(_ tag: MatterTlvTag, _ value: Int64) {
    if value >= Int64(Int8.min) && value <= Int64(Int8.max) {
      writePrimitiveHead(tag: tag, elementType: 0x00)
      buffer.append(UInt8(bitPattern: Int8(value)))
    } else if value >= Int64(Int16.min) && value <= Int64(Int16.max) {
      writePrimitiveHead(tag: tag, elementType: 0x01)
      appendUInt16(UInt16(bitPattern: Int16(value)))
    } else if value >= Int64(Int32.min) && value <= Int64(Int32.max) {
      writePrimitiveHead(tag: tag, elementType: 0x02)
      appendUInt32(UInt32(bitPattern: Int32(value)))
    } else {
      writePrimitiveHead(tag: tag, elementType: 0x03)
      appendUInt64(UInt64(bitPattern: value))
    }
  }

  mutating func putFloat(_ tag: MatterTlvTag, _ value: Float) {
    writePrimitiveHead(tag: tag, elementType: 0x0A)
    var bits = value.bitPattern
    appendUInt32(bits)
  }

  mutating func putDouble(_ tag: MatterTlvTag, _ value: Double) {
    writePrimitiveHead(tag: tag, elementType: 0x0B)
    var bits = value.bitPattern
    appendUInt64(bits)
  }

  mutating func putUTF8String(_ tag: MatterTlvTag, _ value: String) {
    let utf8 = Data(value.utf8)
    if utf8.count <= 255 {
      writePrimitiveHead(tag: tag, elementType: 0x0C)
      buffer.append(UInt8(utf8.count))
      buffer.append(utf8)
    } else {
      writePrimitiveHead(tag: tag, elementType: 0x0C)
      appendUInt16(UInt16(utf8.count))
      buffer.append(utf8)
    }
  }

  mutating func putByteString(_ tag: MatterTlvTag, _ value: Data) {
    if value.count <= 255 {
      writePrimitiveHead(tag: tag, elementType: 0x10)
      buffer.append(UInt8(value.count))
      buffer.append(value)
    } else {
      writePrimitiveHead(tag: tag, elementType: 0x11)
      appendUInt16(UInt16(value.count))
      buffer.append(value)
    }
  }

  private mutating func writeContainerHead(tag: MatterTlvTag, elementType: UInt8) {
    switch tag {
    case .anonymous:
      buffer.append(elementType)
    case .context(let ctx):
      buffer.append(0x20 | elementType)
      buffer.append(UInt8(ctx & 0xFF))
    }
  }

  private mutating func writePrimitiveHead(tag: MatterTlvTag, elementType: UInt8) {
    switch tag {
    case .anonymous:
      buffer.append(elementType)
    case .context(let ctx):
      buffer.append(0x20 | elementType)
      buffer.append(UInt8(ctx & 0xFF))
    }
  }

  private mutating func appendUInt16(_ value: UInt16) {
    var le = value.littleEndian
    withUnsafeBytes(of: &le) { buffer.append(contentsOf: $0) }
  }

  private mutating func appendUInt32(_ value: UInt32) {
    var le = value.littleEndian
    withUnsafeBytes(of: &le) { buffer.append(contentsOf: $0) }
  }

  private mutating func appendUInt64(_ value: UInt64) {
    var le = value.littleEndian
    withUnsafeBytes(of: &le) { buffer.append(contentsOf: $0) }
  }
}
