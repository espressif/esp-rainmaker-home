/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.matter

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import chip.devicecontroller.ChipDeviceController
import chip.devicecontroller.ChipStructs
import chip.devicecontroller.GetConnectedDeviceCallbackJni.GetConnectedDeviceCallback
import chip.devicecontroller.InvokeCallback
import chip.devicecontroller.ReportCallback
import chip.devicecontroller.ResubscriptionAttemptCallback
import chip.devicecontroller.SafeChipCalls
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
import java.util.Optional
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
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
        /** Tells JS whether a subscription link is up, so it knows when reports are live. */
        private const val EVENT_SUBSCRIPTION_STATE = "ESPMatter:subscriptionState"
        private const val SUBSCRIPTION_STATE_ESTABLISHED = "established"
        private const val SUBSCRIPTION_STATE_RESUBSCRIBING = "resubscribing"
        private const val SUBSCRIPTION_STATE_ERROR = "error"
        /** Sent while reports keep coming, so JS can tell a quiet link from a dead one. */
        private const val SUBSCRIPTION_STATE_ALIVE = "alive"
        private const val ALIVE_EMIT_INTERVAL_MS = 10_000L
        private const val DEFAULT_MIN_INTERVAL_SEC = 1
        private const val DEFAULT_MAX_INTERVAL_SEC = 30
        /** Wait before closing a link, so the CHIP code that called us has finished. */
        private const val LINK_CLOSE_DELAY_MS = 250L

        /**
         * Closes links on its own thread. CHIP frees a link the moment it is closed, so closing
         * it from inside one of that link's callbacks frees it while CHIP is still using it.
         * One thread for the whole app, shared by every module instance (JS reloads included),
         * so no thread is left behind and queued closes still run.
         */
        private val linkCloser = Executors.newSingleThreadScheduledExecutor { task ->
            Thread(task, "MatterLinkCloser").apply { isDaemon = true }
        }
    }

    private val mainHandler = Handler(Looper.getMainLooper())

    /** Cached connected-device pointers, keyed by uint64 matter node id. */
    private val devicePtrs = ConcurrentHashMap<Long, Long>()

    /** Controller the cached pointers were minted against; a new one voids them all. */
    @Volatile
    private var devicePtrsOwner: ChipClient? = null

    private data class SubscriptionEntry(
        val handle: String,
        val matterNodeId: Long,
        /** Controller the link was opened on; a link dies with its controller. */
        val owner: ChipClient,
        @Volatile var subscriptionId: Long = 0L,
        /** Set once the link is closed; a link still opening is closed as soon as it opens. */
        @Volatile var closed: Boolean = false,
        /** When "alive" was last sent for this link. */
        @Volatile var lastAliveEmitMs: Long = 0L,
        /** How many of this link's CHIP callbacks are running right now. */
        val callbacksRunning: AtomicInteger = AtomicInteger(0)
    )

    /** Runs one of the link's CHIP callbacks; a close waits until none is running. */
    private inline fun <T> SubscriptionEntry.inCallback(body: () -> T): T {
        callbacksRunning.incrementAndGet()
        try {
            return body()
        } finally {
            callbacksRunning.decrementAndGet()
        }
    }

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
                entry.closed = true
            }
            subscriptions.clear()
            devicePtrs.clear()
            // Every link, including any that no entry tracks any more.
            runCatching { ensureChipClient().chipDeviceController }.getOrNull()
                ?.shutdownSubscriptions()
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
                        invalidateIfSessionLost(nodeId, ex)
                        promise.reject("READ_FAILED", ex.message, ex)
                    }
                }
                try {
                    SafeChipCalls.readAttributePath(
                        controller, callback, devicePtr, listOf(path), DEFAULT_TIMEOUT_MS
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
                        invalidateIfSessionLost(nodeId, ex)
                        promise.reject("WRITE_FAILED", ex?.message ?: "write failed", ex)
                    }
                }
                try {
                    SafeChipCalls.write(controller, callback, devicePtr, listOf(request), 0, 0)
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
                        invalidateIfSessionLost(nodeId, ex)
                        onFailure("INVOKE_FAILED", ex?.message ?: "invoke failed", ex)
                    }
                }
                try {
                    SafeChipCalls.invoke(controller, callback, devicePtr, element, 0, DEFAULT_TIMEOUT_MS)
                } catch (e: Exception) {
                    invalidateIfSessionLost(nodeId, e)
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
        val chipClient = runCatching { ensureChipClient() }
            .getOrElse { promise.reject("NO_FABRIC", it.message, it); return }
        val controller = chipClient.chipDeviceController

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
        val entry = SubscriptionEntry(handle, nodeId, chipClient)
        subscriptions[handle] = entry

        val minInt = if (minIntervalSec > 0) minIntervalSec else DEFAULT_MIN_INTERVAL_SEC
        val maxInt = if (maxIntervalSec > 0) maxIntervalSec else DEFAULT_MAX_INTERVAL_SEC

        getConnectedDevicePointer(nodeId,
            onSuccess = { devicePtr ->
                val subEstablished = SubscriptionEstablishedCallback { subId -> entry.inCallback {
                    entry.subscriptionId = subId
                    if (entry.closed) {
                        // Closed while it was still opening. Close it once this callback is over.
                        Log.d(TAG, "Subscription $handle opened after it was closed; closing it")
                        shutdownSubscriptionById(entry)
                    } else {
                        Log.d(TAG, "Subscription $handle established: matterId=$subId")
                        emitSubscriptionState(matterNodeIdStr, handle, SUBSCRIPTION_STATE_ESTABLISHED)
                    }
                } }
                val resub = ResubscriptionAttemptCallback { cause, nextMs -> entry.inCallback {
                    // A closed link stays quiet, so a newer link to the device is the only voice.
                    if (entry.closed) return@inCallback
                    Log.d(TAG, "Subscription $handle re-attempt: cause=$cause, next=${nextMs}ms")
                    emitSubscriptionState(matterNodeIdStr, handle, SUBSCRIPTION_STATE_RESUBSCRIBING)
                } }
                val report = object : ReportCallback {
                    override fun onReport(nodeState: NodeState?) { entry.inCallback {
                        if (entry.closed) return
                        // Any report, even an empty keep-alive, shows the link works.
                        val now = SystemClock.elapsedRealtime()
                        if (now - entry.lastAliveEmitMs >= ALIVE_EMIT_INTERVAL_MS) {
                            entry.lastAliveEmitMs = now
                            emitSubscriptionState(matterNodeIdStr, handle, SUBSCRIPTION_STATE_ALIVE)
                        }
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
                    } }
                    override fun onError(
                        attributePath: ChipAttributePath?,
                        eventPath: ChipEventPath?,
                        ex: Exception
                    ) { entry.inCallback {
                        Log.w(TAG, "Subscription $handle report error: ${ex.message}")
                        // A closed or old-controller link must not drop the current device pointer.
                        if (!entry.closed && entry.owner === devicePtrsOwner) {
                            invalidateIfSessionLost(nodeId, ex)
                        }
                        // No path means the whole link failed, not one attribute.
                        if (!entry.closed && attributePath == null && eventPath == null) {
                            emitSubscriptionState(matterNodeIdStr, handle, SUBSCRIPTION_STATE_ERROR)
                        }
                    } }
                    override fun onDone() { entry.inCallback {
                        // The link ended without the app closing it.
                        if (!entry.closed) {
                            emitSubscriptionState(matterNodeIdStr, handle, SUBSCRIPTION_STATE_ERROR)
                        }
                    } }
                }

                try {
                    val failedAtOnce = SafeChipCalls.subscribeToPath(
                        controller,
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
                    if (failedAtOnce != null) {
                        // The subscription never started, so do not hand JS a handle for it.
                        subscriptions.remove(handle)
                        promise.reject("SUBSCRIBE_FAILED", failedAtOnce.message, failedAtOnce)
                    } else {
                        val res = Arguments.createMap().apply { putString("subscriptionId", handle) }
                        promise.resolve(res)
                    }
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

    /**
     * Closes this one link. A device can hold several links at once
     * (keepSubscriptions = true), so closing by device would also cut a newer
     * link to it. A link that has not opened yet is closed when it opens.
     */
    private fun shutdownSubscriptionEntry(entry: SubscriptionEntry) {
        entry.closed = true
        if (entry.subscriptionId != 0L) {
            shutdownSubscriptionById(entry)
        }
    }

    /**
     * Closes the link later on [linkCloser], never inside one of its own CHIP callbacks
     * (CHIP would keep using the freed link: SIGSEGV in ExchangeContext::HandleMessage).
     * The delay is what makes this safe: CHIP runs unlocked around each callback, which the
     * running-callback count below cannot see; the count only covers our callback bodies.
     * Uses only the link's own controller and never builds one on this thread.
     */
    private fun shutdownSubscriptionById(entry: SubscriptionEntry) {
        linkCloser.schedule(Runnable {
            if (entry.callbacksRunning.get() > 0) {
                shutdownSubscriptionById(entry)
                return@Runnable
            }
            // Close on the link's own controller even after it was replaced: nothing
            // shuts old controllers down, so their links would run (and resubscribe) forever.
            // That controller was built when the link opened, so none is built here.
            val controller = entry.owner.chipDeviceController
            try {
                controller.shutdownSubscriptions(
                    controller.fabricIndex,
                    entry.matterNodeId,
                    entry.subscriptionId
                )
            } catch (e: Exception) {
                Log.w(TAG, "shutdownSubscriptions failed: ${e.message}")
            }
        }, LINK_CLOSE_DELAY_MS, TimeUnit.MILLISECONDS)
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

    private fun emitSubscriptionState(matterNodeIdStr: String, handle: String, state: String) {
        val event: WritableMap = Arguments.createMap().apply {
            putString("matterNodeId", matterNodeIdStr)
            putString("subscriptionId", handle)
            putString("state", state)
        }
        // Same as reports: CHIP calls back on its worker thread.
        mainHandler.post {
            try {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(EVENT_SUBSCRIPTION_STATE, event)
            } catch (e: Exception) {
                Log.w(TAG, "emit subscriptionState failed: ${e.message}")
            }
        }
    }

    private fun getConnectedDevicePointer(
        nodeId: Long,
        onSuccess: (Long) -> Unit,
        onFailure: (Exception) -> Unit
    ) {
        // Resolve first: ensureChipClient() clears the cache on a controller swap.
        val controller = runCatching { ensureChipClient().chipDeviceController }
            .getOrElse { onFailure(it as? Exception ?: Exception(it.message)); return }
        devicePtrs[nodeId]?.let { onSuccess(it); return }
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

    /**
     * Replaces a CAT subject in the device's EP0 ACL with the fabric's current
     * CAT value (post-rotation repair) — works for both the operate and the
     * admin CAT. CAT rotation keeps the 4-hex identifier and bumps the 4-hex
     * version, so existing subjects are matched by identifier
     * (`subject ushr 16`) and rewritten when the version differs.
     *
     * When no subject with the CAT's identifier exists and the CAT is an
     * OPERATE one (identifier 0x0600–0x08FF), a fresh Operate entry is
     * appended — self-heal for a failed commissioning-time ACL write, same
     * shape as [ChipClient]'s post-commissioning block. Admin CATs are never
     * appended: a device without an admin-CAT subject predates CAT-keyed admin
     * entries (node-id keyed) and there is nothing safe to add.
     */
    fun updateCatAclSubject(
        matterNodeIdStr: String,
        groupCatId: String,
        promise: Promise
    ) {
        val nodeId = parseMatterNodeId(matterNodeIdStr) ?: run {
            promise.reject("INVALID_ARG", "Invalid matterNodeId"); return
        }
        if (groupCatId.isBlank()) {
            promise.reject("INVALID_ARG", "groupCatId is required"); return
        }
        val chipClient = runCatching { ensureChipClient() }
            .getOrElse { promise.reject("NO_FABRIC", it.message, it); return }

        val newSubject = Utils.getCatId(groupCatId)
        if (newSubject == 0L) {
            promise.reject("INVALID_ARG", "groupCatId is not valid hex"); return
        }
        // Backend allocates operate CAT identifiers in 0x0600–0x08FF.
        val catIdentifier = (newSubject ushr 16) and 0xFFFFL
        val isOperateCat = catIdentifier in 0x0600L..0x08FFL

        val aclHelper = AccessControlClusterHelper(chipClient)
        aclHelper.readAclAttributeAsync(nodeId, AppConstants.ENDPOINT_0)
            .whenComplete { aclAttr, readError ->
                if (readError != null) {
                    promise.reject("ACL_READ_FAILED", readError.message, readError)
                    return@whenComplete
                }
                if (aclAttr == null) {
                    // readAclAttribute swallows connection failures into null —
                    // surface it so the JS sweep retries this device later.
                    promise.reject("DEVICE_UNREACHABLE", "ACL read returned no data")
                    return@whenComplete
                }

                val entries =
                    ArrayList<ChipStructs.AccessControlClusterAccessControlEntryStruct>()
                var adminAuthMode = 0
                var adminFabricIndex = 0
                var changed = false
                var catSubjectSeen = false

                for (entry in aclAttr) {
                    entries.add(entry)
                    if (entry.privilege == AppConstants.PRIVILEGE_ADMIN) {
                        adminAuthMode = entry.authMode
                        adminFabricIndex = entry.fabricIndex
                    }
                    val subjects = entry.subjects ?: continue
                    for (i in subjects.indices) {
                        val subject = subjects[i] ?: continue
                        if ((subject ushr 16) == (newSubject ushr 16)) {
                            catSubjectSeen = true
                            if (subject != newSubject) {
                                subjects[i] = newSubject
                                changed = true
                            }
                        }
                    }
                }

                if (!catSubjectSeen) {
                    if (!isOperateCat) {
                        // Nothing to rotate on this device (legacy node-id-keyed
                        // admin entry) — report success so the sweep completes.
                        promise.resolve(successResult())
                        return@whenComplete
                    }
                    val subjects = ArrayList<Long>()
                    subjects.add(newSubject)
                    entries.add(
                        ChipStructs.AccessControlClusterAccessControlEntryStruct(
                            AppConstants.PRIVILEGE_OPERATE,
                            adminAuthMode,
                            subjects,
                            null,
                            Optional.empty(),
                            adminFabricIndex
                        )
                    )
                    changed = true
                }

                if (!changed) {
                    promise.resolve(successResult())
                    return@whenComplete
                }

                aclHelper.writeAclAttributeAsync(nodeId, AppConstants.ENDPOINT_0, entries)
                    .whenComplete { _, writeError ->
                        if (writeError != null) {
                            promise.reject("ACL_WRITE_FAILED", writeError.message, writeError)
                        } else {
                            promise.resolve(successResult())
                        }
                    }
            }
    }

    /** Reuse the active commissioning ChipClient or lazily reconstruct from FabricInfo. */
    private fun ensureChipClient(): ChipClient {
        val client = FabricSessionManager.getCurrentChipClient()
            ?: FabricSessionManager.resolveChipClient(
                reactContext.applicationContext as Context
            )
            ?: throw IllegalStateException("No active fabric for Matter control")

        // A rebuilt controller voids every pointer minted against the old one; invoking on a dangling pointer crashes in the JNI finalizer.
        if (devicePtrsOwner !== client) {
            if (devicePtrsOwner != null && devicePtrs.isNotEmpty()) {
                Log.i(TAG, "ChipClient replaced — dropping ${devicePtrs.size} stale device pointer(s)")
            }
            devicePtrs.clear()
            devicePtrsOwner = client
        }
        return client
    }

    /**
     * Drops a cached pointer whose secure session is gone so the next call re-establishes CASE.
     * @param nodeId Matter node whose pointer is suspect
     * @param ex Failure reported by the operation
     */
    private fun invalidateIfSessionLost(nodeId: Long, ex: Throwable?) {
        val message = ex?.message ?: return
        val sessionGone = message.contains("Missing secure session", ignoreCase = true) ||
            message.contains("0x00000077", ignoreCase = true)
        if (sessionGone && devicePtrs.remove(nodeId) != null) {
            Log.i(TAG, "dropped stale device pointer for node $nodeId after session loss")
        }
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
