/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.matter

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import chip.devicecontroller.ChipDeviceController
import chip.devicecontroller.GetConnectedDeviceCallbackJni.GetConnectedDeviceCallback
import chip.devicecontroller.InvokeCallback
import chip.devicecontroller.ReportCallback
import chip.devicecontroller.ResubscriptionAttemptCallback
import chip.devicecontroller.SubscriptionEstablishedCallback
import chip.devicecontroller.WriteAttributesCallback
import chip.devicecontroller.model.AttributeWriteRequest
import chip.devicecontroller.model.ChipAttributePath
import chip.devicecontroller.model.ChipEventPath
import chip.devicecontroller.model.ChipPathId
import chip.devicecontroller.model.InvokeElement
import chip.devicecontroller.model.NodeState
import chip.devicecontroller.model.Status
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.math.BigInteger
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * Native Matter control adapter for Android.
 *
 * Exposes the four canonical Matter Interaction Model operations —
 * `read`, `write`, `invoke`, `subscribe` (plus their lifecycle siblings
 * `init`, `shutdown`, `unsubscribe`). No semantic translation lives
 * here: callers send raw cluster / attribute / command ids and Matter
 * data-value (`MTRDataValueDictionary`) payloads; this layer encodes
 * them to CHIP TLV via [MatterDataValueCodec], dispatches via
 * [ChipDeviceController], and translates inbound reports back to JS
 * primitives over the `ESPMatter:attributeReport` device event.
 *
 * Cluster-specific semantics (semantic units → Matter command, mode
 * pickers, on/off bool → On/Off cmd, etc.) belong above this layer —
 * either in TypeScript panels/hooks or in the Matter SDK's outbound
 * transformer.
 *
 * Lifecycle: reuses [FabricSessionManager]'s active [ChipClient] when
 * one is in memory (typical right after commissioning). On cold start,
 * lazily reconstructs the [ChipClient] from stored [FabricInfo]. One
 * controller serves all Matter nodes on the user's fabric.
 */
class ESPMatterControl(private val reactContext: ReactApplicationContext) {

    companion object {
        private const val TAG = "ESPMatterControl"
        private const val DEFAULT_TIMEOUT_MS = 15000
        private const val EVENT_ATTRIBUTE_REPORT = "ESPMatter:attributeReport"
        private const val DEFAULT_MIN_INTERVAL_SEC = 1
        private const val DEFAULT_MAX_INTERVAL_SEC = 30
    }

    private val mainHandler = Handler(Looper.getMainLooper())

    /** Cached connected-device pointers, keyed by uint64 matter node id. */
    private val devicePtrs = ConcurrentHashMap<Long, Long>()

    private data class SubscriptionEntry(
        val handle: String,
        val matterNodeId: Long,
        @Volatile var subscriptionId: Long = 0L
    )

    private val subscriptions = ConcurrentHashMap<String, SubscriptionEntry>()
    private val subscriptionHandleSeq = AtomicLong(0L)

    // -----------------------------------------------------------------------
    // OPTIONAL LIFECYCLE
    // -----------------------------------------------------------------------

    /** No-op today; the active [ChipClient] is initialised by commissioning. */
    fun init(@Suppress("UNUSED_PARAMETER") config: ReadableMap?, promise: Promise) {
        promise.resolve(successResult())
    }

    /** Tears down all device pointers and active subscriptions. */
    fun shutdown(promise: Promise) {
        try {
            for (entry in subscriptions.values) {
                shutdownSubscriptionEntry(entry)
            }
            subscriptions.clear()
            devicePtrs.clear()
            promise.resolve(successResult())
        } catch (e: Exception) {
            promise.reject("SHUTDOWN_FAILED", e.message, e)
        }
    }

    // -----------------------------------------------------------------------
    // READ
    // -----------------------------------------------------------------------

    fun read(
        matterNodeIdStr: String,
        endpoint: Int,
        clusterId: Double,
        attributeId: Double,
        promise: Promise
    ) {
        val nodeId = parseMatterNodeId(matterNodeIdStr) ?: run {
            promise.reject("INVALID_ARG", "Invalid matterNodeId"); return
        }
        val controller = runCatching { ensureChipClient().chipDeviceController }
            .getOrElse { promise.reject("NO_FABRIC", it.message, it); return }

        // Hex tags help correlate with the SDK's read() call sites and with
        // logcat lines emitted by the Matter SDK / panel hooks.
        val readTag = "read[ep=$endpoint,clu=0x${clusterId.toLong().toString(16)}," +
                "att=0x${attributeId.toLong().toString(16)}]"
        Log.d(TAG, "$readTag → request")
        getConnectedDevicePointer(nodeId,
            onSuccess = { devicePtr ->
                val path = ChipAttributePath.newInstance(
                    endpoint, clusterId.toLong(), attributeId.toLong()
                )
                val callback = object : ReportCallback {
                    override fun onReport(nodeState: NodeState?) {
                        try {
                            val state = nodeState
                                ?.getEndpointState(endpoint)
                                ?.getClusterState(clusterId.toLong())
                                ?.getAttributeState(attributeId.toLong())
                            val raw = state?.value
                            // Raw-shape line: tells us if CHIP delivered
                            // null, a primitive, a Map<Integer,Object>
                            // (TLV struct) or a ChipStructs$* data class.
                            // Critical when diagnosing why the SDK
                            // resolver gets `undefined` for an attribute.
                            Log.d(
                                TAG,
                                "$readTag ← raw=${if (raw == null) "null" else MatterDataValueCodec.previewValue(raw)}"
                            )
                            val jsValue = MatterDataValueCodec.attributeValueToJs(raw)
                            Log.d(
                                TAG,
                                "$readTag ← decoded type=${jsValue?.javaClass?.simpleName ?: "null"}"
                            )
                            val result = Arguments.createMap().apply {
                                putBoolean("success", true)
                                putAnyValue("value", jsValue)
                            }
                            promise.resolve(result)
                        } catch (e: Exception) {
                            Log.e(TAG, "$readTag processing failed: ${e.message}", e)
                            promise.reject("READ_FAILED", e.message, e)
                        }
                    }

                    override fun onError(
                        attributePath: ChipAttributePath?,
                        eventPath: ChipEventPath?,
                        ex: Exception
                    ) {
                        Log.w(TAG, "$readTag failed: ${ex.message}")
                        promise.reject("READ_FAILED", ex.message, ex)
                    }
                }
                try {
                    controller.readAttributePath(
                        callback, devicePtr, listOf(path), DEFAULT_TIMEOUT_MS
                    )
                } catch (e: Exception) {
                    promise.reject("READ_FAILED", e.message, e)
                }
            },
            onFailure = { e -> promise.reject("CONNECT_FAILED", e.message, e) }
        )
    }

    // -----------------------------------------------------------------------
    // WRITE (raw Matter attribute write — value is `MatterDataValue` shape)
    // -----------------------------------------------------------------------

    fun write(
        matterNodeIdStr: String,
        endpoint: Int,
        clusterId: Double,
        attributeId: Double,
        value: ReadableMap?,
        promise: Promise
    ) {
        val nodeId = parseMatterNodeId(matterNodeIdStr) ?: run {
            promise.reject("INVALID_ARG", "Invalid matterNodeId"); return
        }
        val controller = runCatching { ensureChipClient().chipDeviceController }
            .getOrElse { promise.reject("NO_FABRIC", it.message, it); return }

        val tlv = try {
            MatterDataValueCodec.encodeToTlv(value)
        } catch (e: Exception) {
            promise.reject("ENCODE_FAILED", "MatterDataValue encode failed: ${e.message}", e)
            return
        }

        getConnectedDevicePointer(nodeId,
            onSuccess = { devicePtr ->
                val request = AttributeWriteRequest.newInstance(
                    ChipPathId.forId(endpoint.toLong()),
                    ChipPathId.forId(clusterId.toLong()),
                    ChipPathId.forId(attributeId.toLong()),
                    tlv
                )
                val callback = object : WriteAttributesCallback {
                    override fun onResponse(attributePath: ChipAttributePath?, status: Status?) {
                        promise.resolve(successResult())
                    }
                    override fun onError(attributePath: ChipAttributePath?, ex: Exception?) {
                        Log.w(TAG, "write failed: ${ex?.message}")
                        promise.reject("WRITE_FAILED", ex?.message ?: "write failed", ex)
                    }
                }
                try {
                    controller.write(callback, devicePtr, listOf(request), 0, 0)
                } catch (e: Exception) {
                    promise.reject("WRITE_FAILED", e.message, e)
                }
            },
            onFailure = { e -> promise.reject("CONNECT_FAILED", e.message, e) }
        )
    }

    // -----------------------------------------------------------------------
    // INVOKE (raw Matter command — payload is `MatterDataValue` Structure)
    // -----------------------------------------------------------------------

    fun invoke(
        matterNodeIdStr: String,
        endpoint: Int,
        clusterId: Double,
        commandId: Double,
        commandFields: ReadableMap?,
        promise: Promise
    ) {
        invokeInternal(matterNodeIdStr, endpoint, clusterId.toLong(), commandId.toLong(), commandFields,
            onSuccess = { promise.resolve(successResult()) },
            onFailure = { code, msg, t -> promise.reject(code, msg, t) }
        )
    }

    fun encodeCommandFieldsToTlvHex(commandFields: ReadableMap?, promise: Promise) {
        try {
            val tlv = MatterDataValueCodec.encodeCommandFieldsToTlv(commandFields)
            val hex = tlv.joinToString("") { b -> "%02x".format(b) }
            promise.resolve("0x$hex")
        } catch (e: Exception) {
            promise.reject("ENCODE_FAILED", e.message, e)
        }
    }

    private fun invokeInternal(
        matterNodeIdStr: String,
        endpoint: Int,
        clusterId: Long,
        commandId: Long,
        commandFields: ReadableMap?,
        onSuccess: () -> Unit,
        onFailure: (String, String, Throwable?) -> Unit
    ) {
        val nodeId = parseMatterNodeId(matterNodeIdStr) ?: run {
            onFailure("INVALID_ARG", "Invalid matterNodeId", null); return
        }
        val controller = runCatching { ensureChipClient().chipDeviceController }
            .getOrElse { onFailure("NO_FABRIC", it.message ?: "no fabric", it); return }

        val tlv = try {
            MatterDataValueCodec.encodeCommandFieldsToTlv(commandFields)
        } catch (e: Exception) {
            onFailure("ENCODE_FAILED", "MatterDataValue encode failed: ${e.message}", e); return
        }

        getConnectedDevicePointer(nodeId,
            onSuccess = { devicePtr ->
                val element = InvokeElement.newInstance(endpoint, clusterId, commandId, tlv, null)
                val callback = object : InvokeCallback {
                    override fun onResponse(invokeElement: InvokeElement?, successCode: Long) {
                        onSuccess()
                    }
                    override fun onError(ex: Exception?) {
                        Log.w(TAG, "invoke failed: ${ex?.message}")
                        onFailure("INVOKE_FAILED", ex?.message ?: "invoke failed", ex)
                    }
                }
                try {
                    controller.invoke(callback, devicePtr, element, 0, DEFAULT_TIMEOUT_MS)
                } catch (e: Exception) {
                    onFailure("INVOKE_FAILED", e.message ?: "invoke threw", e)
                }
            },
            onFailure = { e -> onFailure("CONNECT_FAILED", e.message ?: "connect failed", e) }
        )
    }

    // -----------------------------------------------------------------------
    // SUBSCRIBE / UNSUBSCRIBE
    // -----------------------------------------------------------------------

    fun subscribe(
        matterNodeIdStr: String,
        attributePaths: ReadableArray?,
        minIntervalSec: Int,
        maxIntervalSec: Int,
        promise: Promise
    ) {
        val nodeId = parseMatterNodeId(matterNodeIdStr) ?: run {
            promise.reject("INVALID_ARG", "Invalid matterNodeId"); return
        }
        val controller = runCatching { ensureChipClient().chipDeviceController }
            .getOrElse { promise.reject("NO_FABRIC", it.message, it); return }

        // Build subscription paths. JS may omit `attributeId` to request a
        // *cluster-wildcard* subscription — needed for FW that rejects
        // explicit attribute paths but serialises the same attributes
        // under wildcard expansion (Google Home / chip-tool style).
        val paths = mutableListOf<ChipAttributePath>()
        if (attributePaths != null) {
            for (i in 0 until attributePaths.size()) {
                val m = attributePaths.getMap(i) ?: continue
                val endpointId = ChipPathId.forId(m.getInt("endpoint").toLong())
                val clusterId = ChipPathId.forId(m.getDouble("clusterId").toLong())
                val attributeId =
                    if (m.hasKey("attributeId") && !m.isNull("attributeId")) {
                        ChipPathId.forId(m.getDouble("attributeId").toLong())
                    } else {
                        ChipPathId.forWildcard()
                    }
                paths += ChipAttributePath.newInstance(endpointId, clusterId, attributeId)
            }
        }
        if (paths.isEmpty()) {
            promise.reject("INVALID_ARG", "subscribe: no attribute paths"); return
        }

        val handle = "sub-${subscriptionHandleSeq.incrementAndGet()}"
        val entry = SubscriptionEntry(handle, nodeId)
        subscriptions[handle] = entry

        val minInt = if (minIntervalSec > 0) minIntervalSec else DEFAULT_MIN_INTERVAL_SEC
        val maxInt = if (maxIntervalSec > 0) maxIntervalSec else DEFAULT_MAX_INTERVAL_SEC

        getConnectedDevicePointer(nodeId,
            onSuccess = { devicePtr ->
                val subEstablished = SubscriptionEstablishedCallback { subId ->
                    entry.subscriptionId = subId
                    Log.d(TAG, "Subscription $handle established: matterId=$subId")
                }
                val resub = ResubscriptionAttemptCallback { cause, nextMs ->
                    Log.d(TAG, "Subscription $handle re-attempt: cause=$cause, next=${nextMs}ms")
                }
                val report = object : ReportCallback {
                    override fun onReport(nodeState: NodeState?) {
                        if (nodeState == null) return
                        // Walk every endpoint/cluster/attribute the device
                        // reported. This must NOT iterate the requested
                        // `paths` because wildcard-subscribed clusters
                        // (e.g. PowerSource on RVC firmwares that quirk
                        // on concrete-path subscribes) expand on-device
                        // and the resulting attribute ids aren't known
                        // to the requestor.
                        for ((endpointBoxed, endpointState) in nodeState.endpointStates) {
                            val ep = endpointBoxed
                            for ((clusterBoxed, clusterState) in endpointState.clusterStates) {
                                val clu = clusterBoxed
                                for ((attributeBoxed, attributeState) in clusterState.attributeStates) {
                                    val att = attributeBoxed
                                    val raw = attributeState.value
                                    Log.d(
                                        TAG,
                                        "sub[$handle] report ep=$ep clu=0x${clu.toString(16)} " +
                                            "att=0x${att.toString(16)} raw=${MatterDataValueCodec.previewValue(raw)}"
                                    )
                                    val jsValue = MatterDataValueCodec.attributeValueToJs(raw)
                                    emitAttributeReport(matterNodeIdStr, ep, clu, att, jsValue)
                                }
                            }
                        }
                    }
                    override fun onError(
                        attributePath: ChipAttributePath?,
                        eventPath: ChipEventPath?,
                        ex: Exception
                    ) {
                        Log.w(TAG, "Subscription $handle report error: ${ex.message}")
                    }
                }

                try {
                    controller.subscribeToPath(
                        subEstablished,
                        resub,
                        report,
                        devicePtr,
                        paths,
                        emptyList<ChipEventPath>(),
                        minInt,
                        maxInt,
                        true,
                        false,
                        0
                    )
                    val res = Arguments.createMap().apply { putString("subscriptionId", handle) }
                    promise.resolve(res)
                } catch (e: Exception) {
                    subscriptions.remove(handle)
                    promise.reject("SUBSCRIBE_FAILED", e.message, e)
                }
            },
            onFailure = { e ->
                subscriptions.remove(handle)
                promise.reject("CONNECT_FAILED", e.message, e)
            }
        )
    }

    fun unsubscribe(handle: String, promise: Promise) {
        val entry = subscriptions.remove(handle)
        if (entry == null) {
            promise.resolve(successResult()); return
        }
        try {
            shutdownSubscriptionEntry(entry)
            promise.resolve(successResult())
        } catch (e: Exception) {
            promise.reject("UNSUBSCRIBE_FAILED", e.message, e)
        }
    }

    private fun shutdownSubscriptionEntry(entry: SubscriptionEntry) {
        val controller = runCatching { ensureChipClient().chipDeviceController }.getOrNull()
            ?: return
        try {
            // CHIP exposes overloads at multiple specificities; the
            // (fabricIndex, peerNodeId) form tears down every active
            // subscription for that node, matching our 1-handle-per-node usage.
            val fabricIndex = runCatching {
                ChipDeviceController::class.java
                    .getMethod("getFabricIndex")
                    .invoke(controller) as? Int ?: 0
            }.getOrDefault(0)

            try {
                ChipDeviceController::class.java.getMethod(
                    "shutdownSubscriptions",
                    Int::class.javaPrimitiveType,
                    Long::class.javaPrimitiveType
                ).invoke(controller, fabricIndex, entry.matterNodeId)
            } catch (e: NoSuchMethodException) {
                // Fall back to the no-arg overload if per-peer is unavailable.
                controller.shutdownSubscriptions()
            }
        } catch (e: Exception) {
            Log.w(TAG, "shutdownSubscriptions failed: ${e.message}")
        }
    }

    // -----------------------------------------------------------------------
    // INTERNALS
    // -----------------------------------------------------------------------

    private fun emitAttributeReport(
        matterNodeIdStr: String,
        endpoint: Int,
        clusterId: Long,
        attributeId: Long,
        jsValue: Any?
    ) {
        val event: WritableMap = Arguments.createMap().apply {
            putString("matterNodeId", matterNodeIdStr)
            putInt("endpoint", endpoint)
            putDouble("clusterId", clusterId.toDouble())
            putDouble("attributeId", attributeId.toDouble())
            putAnyValue("value", jsValue)
        }
        // RN bridge events must be dispatched on a thread with a Looper;
        // the CHIP report callback runs on the controller's worker thread.
        mainHandler.post {
            try {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(EVENT_ATTRIBUTE_REPORT, event)
            } catch (e: Exception) {
                Log.w(TAG, "emit attributeReport failed: ${e.message}")
            }
        }
    }

    private fun getConnectedDevicePointer(
        nodeId: Long,
        onSuccess: (Long) -> Unit,
        onFailure: (Exception) -> Unit
    ) {
        devicePtrs[nodeId]?.let { onSuccess(it); return }
        val controller = runCatching { ensureChipClient().chipDeviceController }
            .getOrElse { onFailure(it as? Exception ?: Exception(it.message)); return }
        try {
            controller.getConnectedDevicePointer(
                nodeId,
                object : GetConnectedDeviceCallback {
                    override fun onDeviceConnected(devicePointer: Long) {
                        devicePtrs[nodeId] = devicePointer
                        onSuccess(devicePointer)
                    }
                    override fun onConnectionFailure(failedNodeId: Long, error: Exception?) {
                        onFailure(error ?: Exception("connection failure for $failedNodeId"))
                    }
                }
            )
        } catch (e: Exception) {
            onFailure(e)
        }
    }

    /** Reuse the active commissioning ChipClient or lazily reconstruct from FabricInfo. */
    private fun ensureChipClient(): ChipClient {
        val existing = FabricSessionManager.getCurrentChipClient()
        if (existing != null) return existing

        val resolved = FabricSessionManager.resolveChipClient(
            reactContext.applicationContext as Context
        )
        if (resolved != null) return resolved

        throw IllegalStateException("No active fabric for Matter control")
    }

    private fun parseMatterNodeId(s: String?): Long? {
        if (s.isNullOrBlank()) return null
        val cleaned = s.removePrefix("0x").removePrefix("0X")
        return runCatching { BigInteger(cleaned, 16).toLong() }
            .recoverCatching { java.lang.Long.parseUnsignedLong(s) }
            .getOrNull()
    }

    private fun successResult(): WritableMap =
        Arguments.createMap().apply { putBoolean("success", true) }
}

/** Helper to put a heterogeneous JS value into a [WritableMap] without cluttering call sites. */
private fun WritableMap.putAnyValue(key: String, value: Any?) {
    when (value) {
        null -> putNull(key)
        is Boolean -> putBoolean(key, value)
        is Int -> putInt(key, value)
        is Double -> putDouble(key, value)
        is String -> putString(key, value)
        is com.facebook.react.bridge.WritableArray -> putArray(key, value)
        is com.facebook.react.bridge.WritableMap -> putMap(key, value)
        else -> putString(key, value.toString())
    }
}
