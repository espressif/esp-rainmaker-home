/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.matter

import android.util.Base64
import android.util.Log
import chip.devicecontroller.model.AttributeState
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import matter.tlv.AnonymousTag
import matter.tlv.ContextSpecificTag
import matter.tlv.Tag
import matter.tlv.TlvWriter

/**
 * Apple `MTRDataValueDictionary` ↔ CHIP TLV codec for the Matter control adapter.
 *
 * Outbound (write attribute, invoke command) — JS hands us the
 * data-value-dictionary tree as a [ReadableMap]; we walk it and emit CHIP TLV
 * bytes that `AttributeWriteRequest.newInstance` and
 * `InvokeElement.newInstance` accept.
 *
 * Inbound (read result, subscribe report) — CHIP gives us already-decoded Java
 * primitives via [AttributeState.getValue] (Boolean / Long / Double / String /
 * List / Map), so we just translate to React Native types.
 */
object MatterDataValueCodec {

    private const val TAG = "MatterDataValueCodec"

    // -----------------------------------------------------------------------
    // OUTBOUND: data-value-dict (ReadableMap) → CHIP TLV bytes
    // -----------------------------------------------------------------------

    /**
     * Encode a top-level [ReadableMap] (`MatterDataValue` shape) into TLV
     * bytes. The top-level value uses [AnonymousTag] — Matter cluster
     * commands and writes do not carry an outer context tag.
     */
    fun encodeToTlv(value: ReadableMap?): ByteArray {
        val writer = TlvWriter()
        writeValue(writer, AnonymousTag, value)
        return writer.getEncoded()
    }

    /**
     * Encode invoke command fields. Matter requires the top-level command
     * payload to be a Structure (anonymous-tagged) — even when the command
     * has no fields. JS may send `undefined` for fieldless commands (e.g.
     * RVC `Start`/`Stop`/`Pause`/`Resume`), which arrives here as `null`;
     * default to an empty Structure rather than a Null primitive so CHIP's
     * `TLVReader` can descend into the container.
     */
    fun encodeCommandFieldsToTlv(value: ReadableMap?): ByteArray {
        val writer = TlvWriter()
        if (value == null) {
            writer.startStructure(AnonymousTag)
            writer.endStructure()
        } else {
            writeValue(writer, AnonymousTag, value)
        }
        return writer.getEncoded()
    }

    private fun writeValue(writer: TlvWriter, tag: Tag, value: ReadableMap?) {
        if (value == null || !value.hasKey("type")) {
            writer.putNull(tag)
            return
        }

        when (val type = value.getString("type")) {
            "Null" -> writer.putNull(tag)

            "Boolean" -> writer.put(tag, value.getBoolean("value"))

            // JS bridges all numbers as Double; cast to the right CHIP int
            // type so TlvWriter emits the correct TLV element class.
            "UnsignedInteger" -> {
                val n = value.getDouble("value").toLong()
                writer.put(tag, n.toULong())
            }

            "SignedInteger" -> {
                val n = value.getDouble("value").toLong()
                writer.put(tag, n)
            }

            "Float" -> writer.put(tag, value.getDouble("value").toFloat())

            "Double" -> writer.put(tag, value.getDouble("value"))

            "UTF8String" -> writer.put(tag, value.getString("value") ?: "")

            "OctetString" -> {
                val b64 = value.getString("value") ?: ""
                val bytes = try {
                    Base64.decode(b64, Base64.NO_WRAP)
                } catch (e: Exception) {
                    Log.w(TAG, "OctetString base64 decode failed: ${e.message}")
                    ByteArray(0)
                }
                writer.put(tag, bytes)
            }

            "Structure" -> {
                writer.startStructure(tag)
                val entries = value.getArray("value")
                if (entries != null) {
                    for (i in 0 until entries.size()) {
                        val entry = entries.getMap(i) ?: continue
                        val ctxTag = entry.getInt("contextTag")
                        val data = entry.getMap("data")
                        writeValue(writer, ContextSpecificTag(ctxTag), data)
                    }
                }
                writer.endStructure()
            }

            "Array" -> {
                writer.startArray(tag)
                val entries = value.getArray("value")
                if (entries != null) {
                    for (i in 0 until entries.size()) {
                        val entry = entries.getMap(i) ?: continue
                        val data = entry.getMap("data")
                        // Array elements are anonymous-tagged in Matter TLV.
                        writeValue(writer, AnonymousTag, data)
                    }
                }
                writer.endArray()
            }

            else -> {
                Log.w(TAG, "Unknown MatterDataValue type '$type', emitting null")
                writer.putNull(tag)
            }
        }
    }

    // -----------------------------------------------------------------------
    // INBOUND: CHIP `AttributeState.value` → React Native primitive
    // -----------------------------------------------------------------------

    /**
     * Convert a value returned by [AttributeState.getValue] into a type that
     * React Native can serialize across the bridge.
     *
     * `Long` is downcast to `Double` when it fits in 53-bit safe-int range;
     * otherwise it is stringified to avoid silent precision loss.
     */
    /**
     * Diagnostic preview of a CHIP-decoded value, useful when wiring up a
     * new resolver/codec and you want to see exactly what the Matter SDK
     * pipeline is fed before TS-side decoding kicks in. Truncates large
     * collections so logcat stays readable.
     */
    fun previewValue(value: Any?): String {
        if (value == null) return "null"
        return when (value) {
            is List<*> -> {
                val first = value.take(3).joinToString(", ") { previewValue(it) }
                "List<${value.size}>[$first${if (value.size > 3) ", …" else ""}]"
            }
            is Map<*, *> -> {
                val first = value.entries.take(3).joinToString(", ") {
                    "${it.key}=${previewValue(it.value)}"
                }
                "Map<${value.size}>{$first${if (value.size > 3) ", …" else ""}} (cls=${value.javaClass.name})"
            }
            is ByteArray -> "ByteArray<${value.size}>"
            is String -> "\"${value.take(40)}${if (value.length > 40) "…" else ""}\""
            else -> "${value.javaClass.simpleName}($value)"
        }
    }

    fun attributeValueToJs(value: Any?): Any? = when (value) {
        null -> null
        is Boolean -> value
        is Int -> value
        is Short -> value.toInt()
        is Byte -> value.toInt()
        is Long -> if (value in -SAFE_INT_BOUND..SAFE_INT_BOUND) value.toDouble() else value.toString()
        is Float -> value.toDouble()
        is Double -> value
        is String -> value
        is ByteArray -> Base64.encodeToString(value, Base64.NO_WRAP)
        is List<*> -> {
            val arr: WritableArray = Arguments.createArray()
            for (item in value) {
                pushAny(arr, attributeValueToJs(item))
            }
            arr
        }
        is Map<*, *> -> {
            // CHIP Android's TLV decoder represents Matter Structures as
            // `Map<Integer, Object>` (or `Long` for some payloads) keyed by
            // the context-tag number — NOT by String. Stringify any key so
            // JS sees `{"0": label, "1": mode, "2": [...]}`, matching what
            // `MatterDataValueCodec.attributeValueToJs` is expected to emit
            // and what the JS-side decoders (`decodeModeOptions`,
            // `useRobotVacuum`, etc.) read with `e["0"] / e["1"] / e["2"]`.
            val map: WritableMap = Arguments.createMap()
            for ((k, v) in value) {
                val key = when (k) {
                    null -> continue
                    is String -> k
                    else -> k.toString()
                }
                putAny(map, key, attributeValueToJs(v))
            }
            map
        }
        else -> value.toString()
    }

    private const val SAFE_INT_BOUND: Long = (1L shl 53) - 1

    private fun pushAny(arr: WritableArray, v: Any?) {
        when (v) {
            null -> arr.pushNull()
            is Boolean -> arr.pushBoolean(v)
            is Int -> arr.pushInt(v)
            is Double -> arr.pushDouble(v)
            is String -> arr.pushString(v)
            is WritableArray -> arr.pushArray(v)
            is WritableMap -> arr.pushMap(v)
            else -> arr.pushString(v.toString())
        }
    }

    private fun putAny(map: WritableMap, key: String, v: Any?) {
        when (v) {
            null -> map.putNull(key)
            is Boolean -> map.putBoolean(key, v)
            is Int -> map.putInt(key, v)
            is Double -> map.putDouble(key, v)
            is String -> map.putString(key, v)
            is WritableArray -> map.putArray(key, v)
            is WritableMap -> map.putMap(key, v)
            else -> map.putString(key, v.toString())
        }
    }
}
