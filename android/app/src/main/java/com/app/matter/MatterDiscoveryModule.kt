/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.matter

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Log
import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager
import java.math.BigInteger
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.cancel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Matter operational local discovery backed by CHIP — not RainMaker mDNS.
 *
 * Given known Matter node ids (from cloud / CDF), probes each node via
 * [ChipDeviceController.getConnectedDevicePointer] so CHIP performs operational
 * mDNS matching and CASE setup. Emits the same `DiscoveryUpdate` / `DiscoveryLost`
 * events consumed by the JS [MatterDiscoverAdapter].
 */
class MatterDiscoveryModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ReactPackage {

    companion object {
        private const val TAG = "MatterDiscoveryModule"
        private const val LOG_PREFIX = "[MatterDiscovery]"
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var discoveryJob: Job? = null
    private val reachableNodeIds = ConcurrentHashMap.newKeySet<String>()
    private val lastKnownHostByNodeId = ConcurrentHashMap<String, String>()
    private val lastKnownPortByNodeId = ConcurrentHashMap<String, Int>()
    private var targetMatterNodeIds: List<String> = emptyList()
    private val pollCycleCounter = AtomicLong(0L)
    private var multicastLock: WifiManager.MulticastLock? = null

    override fun getName(): String = "MatterDiscoveryModule"

    override fun createViewManagers(
        reactContext: ReactApplicationContext,
    ): MutableList<ViewManager<View, ReactShadowNode<*>>> = mutableListOf()

    override fun createNativeModules(
        reactContext: ReactApplicationContext,
    ): MutableList<NativeModule> = listOf(this).toMutableList()

    /**
     * Starts CHIP-backed operational discovery for the Matter node ids in `config`.
     *
     * @param config Map with optional `matterNodeIds` (array of hex strings) and ignored
     *   `serviceType` / `domain` fields kept for adapter interface parity.
     */
    @ReactMethod
    fun startDiscovery(config: ReadableMap) {
        val serviceType = config.optString("serviceType")
        val domain = config.optString("domain")
        targetMatterNodeIds = parseMatterNodeIds(config)

        Log.i(
            TAG,
            "$LOG_PREFIX startDiscovery: serviceType=$serviceType domain=$domain " +
                "targetCount=${targetMatterNodeIds.size} targets=${formatNodeIdList(targetMatterNodeIds)} " +
                "pollIntervalMs=${AppConstants.MATTER_DISCOVERY_POLL_INTERVAL_MS}",
        )
        logFabricSnapshot("startDiscovery")
        logTargetVerificationHints("startDiscovery")
        acquireMulticastLock()
        startProbingLoop()
    }

    /** Stops every active CHIP discovery probe. */
    @ReactMethod
    fun stopDiscovery() {
        val previouslyReachable = reachableNodeIds.toList()
        Log.i(
            TAG,
            "$LOG_PREFIX stopDiscovery: cancelling probe job, clearing reachableSet " +
                "(count=${previouslyReachable.size} ids=${formatNodeIdList(previouslyReachable)})",
        )
        stopProbingLoop()
        reachableNodeIds.clear()
        lastKnownHostByNodeId.clear()
        lastKnownPortByNodeId.clear()
        pollCycleCounter.set(0L)
        releaseMulticastLock()
    }

    /** Stops discovery (Matter module only handles operational Matter). */
    @ReactMethod
    fun stopDiscoveryForType(serviceType: String) {
        Log.i(TAG, "$LOG_PREFIX stopDiscoveryForType: serviceType=$serviceType")
        stopDiscovery()
    }

    /**
     * Updates target node ids without restarting when discovery is already running.
     *
     * @param nodeIds Array of lower/upper-case hex Matter node ids.
     */
    @ReactMethod
    fun setTargetMatterNodeIds(nodeIds: ReadableArray) {
        val previousTargets = targetMatterNodeIds
        targetMatterNodeIds = readableArrayToNodeIds(nodeIds)
        val probeAlreadyRunning = discoveryJob?.isActive == true

        Log.i(
            TAG,
            "$LOG_PREFIX setTargetMatterNodeIds: previousCount=${previousTargets.size} " +
                "newCount=${targetMatterNodeIds.size} probeRunning=$probeAlreadyRunning " +
                "targets=${formatNodeIdList(targetMatterNodeIds)}",
        )
        logTargetVerificationHints("setTargetMatterNodeIds")

        if (probeAlreadyRunning) {
            val newlyAdded = targetMatterNodeIds.filter { it !in previousTargets }
            if (newlyAdded.isNotEmpty()) {
                Log.i(
                    TAG,
                    "$LOG_PREFIX setTargetMatterNodeIds: immediately probing ${newlyAdded.size} " +
                        "newly-added node(s) in parallel (not waiting for the in-flight cycle): " +
                        formatNodeIdList(newlyAdded),
                )
                scope.launch { probeNewlyAddedNodes(newlyAdded) }
            } else {
                Log.d(TAG, "$LOG_PREFIX setTargetMatterNodeIds: probe loop already active — targets updated in-place")
            }
            return
        }
        if (targetMatterNodeIds.isNotEmpty()) {
            acquireMulticastLock()
            startProbingLoop()
        } else {
            Log.w(TAG, "$LOG_PREFIX setTargetMatterNodeIds: empty target list — probe loop not started")
        }
    }

    private fun parseMatterNodeIds(config: ReadableMap): List<String> {
        if (!config.hasKey(AppConstants.KEY_MATTER_NODE_IDS)) {
            Log.w(TAG, "$LOG_PREFIX parseMatterNodeIds: config missing key '${AppConstants.KEY_MATTER_NODE_IDS}'")
            return emptyList()
        }
        val array = config.getArray(AppConstants.KEY_MATTER_NODE_IDS)
        if (array == null) {
            Log.w(TAG, "$LOG_PREFIX parseMatterNodeIds: '${AppConstants.KEY_MATTER_NODE_IDS}' is null")
            return emptyList()
        }
        return readableArrayToNodeIds(array)
    }

    private fun readableArrayToNodeIds(array: ReadableArray): List<String> {
        val ids = mutableListOf<String>()
        for (index in 0 until array.size()) {
            val raw = array.getString(index)?.trim()?.lowercase()
            if (!raw.isNullOrEmpty()) {
                ids.add(raw)
            } else {
                Log.w(TAG, "$LOG_PREFIX readableArrayToNodeIds: skipped empty entry at index=$index")
            }
        }
        return ids
    }

    private fun startProbingLoop() {
        stopProbingLoop()
        if (targetMatterNodeIds.isEmpty()) {
            Log.w(TAG, "$LOG_PREFIX startProbingLoop: aborted — no target Matter node ids")
            return
        }

        Log.i(
            TAG,
            "$LOG_PREFIX startProbingLoop: launching CHIP probe coroutine for " +
                "${targetMatterNodeIds.size} node(s), interval=${AppConstants.MATTER_DISCOVERY_POLL_INTERVAL_MS}ms",
        )
        logFabricSnapshot("startProbingLoop")

        discoveryJob = scope.launch {
            while (isActive) {
                val cycle = pollCycleCounter.incrementAndGet()
                runPollCycle(cycle)
                delay(AppConstants.MATTER_DISCOVERY_POLL_INTERVAL_MS)
            }
        }
    }

    private suspend fun runPollCycle(cycle: Long) {
        Log.d(
            TAG,
            "$LOG_PREFIX pollCycle #$cycle begin: targetCount=${targetMatterNodeIds.size} " +
                "currentlyReachable=${reachableNodeIds.size} reachable=${formatNodeIdList(reachableNodeIds.toList())}",
        )

        val chipClient =
            FabricSessionManager.resolveChipClient(reactApplicationContext.applicationContext)
        if (chipClient == null) {
            Log.w(
                TAG,
                "$LOG_PREFIX pollCycle #$cycle: ChipClient unavailable — fabric may not be stored yet. " +
                    "Will retry after ${AppConstants.MATTER_DISCOVERY_POLL_INTERVAL_MS}ms",
            )
            logFabricSnapshot("pollCycle-$cycle-no-client")
            return
        }

        Log.d(TAG, "$LOG_PREFIX pollCycle #$cycle: ChipClient ready, probing ${targetMatterNodeIds.size} node(s)")

        var newlyDiscovered = 0
        var stillReachable = 0
        var unreachable = 0
        var lost = 0

        // Probe every node CONCURRENTLY (bounded). Each probeNode emits its own
        // DiscoveryUpdate the instant it resolves, so a reachable node's status
        // reaches the store/UI immediately and is NEVER held back by an
        // unreachable node's connect timeout running in parallel. awaitAll only
        // gates when THIS cycle's summary is tallied / the next cycle starts —
        // not when a reachable node becomes visible.
        val probeSemaphore = Semaphore(AppConstants.MATTER_DISCOVERY_MAX_CONCURRENT_PROBES)
        val outcomes = coroutineScope {
            targetMatterNodeIds.map { matterNodeIdHex ->
                async {
                    if (!isActive) ProbeOutcome.INVALID_NODE_ID
                    else probeSemaphore.withPermit { probeNode(chipClient, matterNodeIdHex, cycle) }
                }
            }.awaitAll()
        }

        for (outcome in outcomes) {
            when (outcome) {
                ProbeOutcome.NEWLY_DISCOVERED -> newlyDiscovered++
                ProbeOutcome.STILL_REACHABLE -> stillReachable++
                ProbeOutcome.UNREACHABLE -> unreachable++
                ProbeOutcome.LOST -> lost++
                ProbeOutcome.INVALID_NODE_ID -> {}
                ProbeOutcome.CONNECTED_NO_HOST -> unreachable++
            }
        }

        Log.i(
            TAG,
            "$LOG_PREFIX pollCycle #$cycle complete: newlyDiscovered=$newlyDiscovered " +
                "stillReachable=$stillReachable unreachable=$unreachable lost=$lost " +
                "reachableSet=${formatNodeIdList(reachableNodeIds.toList())}",
        )
    }

    /**
     * Probes just-added node ids immediately, in parallel, without waiting for the
     * current poll cycle (which may be blocked on an unreachable node). A reachable
     * node emits its DiscoveryUpdate right away, so a freshly commissioned / newly
     * appeared device becomes reachable on WLAN in ~1s instead of after the in-flight
     * cycle finishes and the next cycle's turn comes around.
     */
    private suspend fun probeNewlyAddedNodes(nodeIds: List<String>) {
        val chipClient =
            FabricSessionManager.resolveChipClient(reactApplicationContext.applicationContext)
        if (chipClient == null) {
            Log.w(
                TAG,
                "$LOG_PREFIX probeNewlyAddedNodes: ChipClient unavailable — nodes will be picked up next cycle",
            )
            return
        }
        val cycle = pollCycleCounter.get()
        val semaphore = Semaphore(AppConstants.MATTER_DISCOVERY_MAX_CONCURRENT_PROBES)
        coroutineScope {
            nodeIds.map { id ->
                async { semaphore.withPermit { probeNode(chipClient, id, cycle) } }
            }.awaitAll()
        }
    }

    private fun stopProbingLoop() {
        if (discoveryJob?.isActive == true) {
            Log.d(TAG, "$LOG_PREFIX stopProbingLoop: cancelling active probe job")
        }
        discoveryJob?.cancel()
        discoveryJob = null
    }

    private enum class ProbeOutcome {
        NEWLY_DISCOVERED,
        STILL_REACHABLE,
        UNREACHABLE,
        LOST,
        INVALID_NODE_ID,
        CONNECTED_NO_HOST,
    }

    private suspend fun probeNode(
        chipClient: ChipClient,
        matterNodeIdHex: String,
        cycle: Long,
    ): ProbeOutcome {
        val deviceId = matterNodeIdHexToLong(matterNodeIdHex)
        if (deviceId == null) {
            Log.e(
                TAG,
                "$LOG_PREFIX pollCycle #$cycle probe: invalid matterNodeIdHex='$matterNodeIdHex'",
            )
            return ProbeOutcome.INVALID_NODE_ID
        }

        val wasReachable = reachableNodeIds.contains(matterNodeIdHex)
        val probeStartMs = System.currentTimeMillis()

        Log.d(
            TAG,
            "$LOG_PREFIX pollCycle #$cycle probe begin: matterNodeId=$matterNodeIdHex " +
                "${formatMatterDeviceId(matterNodeIdHex, deviceId)} wasReachable=$wasReachable",
        )

        return try {
            // Cap the CHIP resolve/CASE so an unreachable node fails fast instead
            // of blocking on CHIP's ~40s AddressResolve default. Runs in parallel
            // with other nodes' probes, so it never delays a reachable node.
            val devicePointer = withTimeoutOrNull(
                AppConstants.MATTER_DISCOVERY_CONNECT_TIMEOUT_MS,
            ) {
                chipClient.awaitGetConnectedDevicePointer(deviceId)
            }
            if (devicePointer == null) {
                val elapsedMs = System.currentTimeMillis() - probeStartMs
                Log.w(
                    TAG,
                    "[MatterProbe] $LOG_PREFIX pollCycle #$cycle probe TIMED OUT " +
                        "(cap ${AppConstants.MATTER_DISCOVERY_CONNECT_TIMEOUT_MS}ms): " +
                        "matterNodeId=$matterNodeIdHex deviceId=$deviceId elapsedMs=$elapsedMs",
                )
                if (wasReachable && reachableNodeIds.remove(matterNodeIdHex)) {
                    lastKnownHostByNodeId.remove(matterNodeIdHex)
                    lastKnownPortByNodeId.remove(matterNodeIdHex)
                    Log.i(
                        TAG,
                        "$LOG_PREFIX pollCycle #$cycle LOST: matterNodeId=$matterNodeIdHex (connect timed out)",
                    )
                    emitDiscoveryLost(matterNodeIdHex)
                    return ProbeOutcome.LOST
                }
                return ProbeOutcome.UNREACHABLE
            }
            val connectElapsedMs = System.currentTimeMillis() - probeStartMs

            val location = chipClient.getNetworkLocationForNode(deviceId)
            val hostFromLocation = location?.ipAddress
            val hostFromChip = chipClient.getIpAddressForNode(deviceId)
            val host = hostFromLocation ?: hostFromChip
            val port = location?.port ?: 5540

            Log.d(
                TAG,
                "$LOG_PREFIX pollCycle #$cycle probe connected: matterNodeId=$matterNodeIdHex " +
                    "devicePointer=$devicePointer elapsedMs=$connectElapsedMs " +
                    "host=$host port=$port " +
                    "hostSource=${when {
                        hostFromLocation != null -> "networkLocation"
                        hostFromChip != null -> "getIpAddress"
                        else -> "none"
                    }} " +
                    "networkLocation=${formatNetworkLocation(location)}",
            )

            if (host.isNullOrEmpty()) {
                Log.w(
                    TAG,
                    "$LOG_PREFIX pollCycle #$cycle probe: CASE connected for matterNodeId=$matterNodeIdHex " +
                        "but host/port could not be resolved (devicePointer=$devicePointer)",
                )
                return ProbeOutcome.CONNECTED_NO_HOST
            }

            val needsLivenessProbe =
                wasReachable ||
                    connectElapsedMs < AppConstants.MATTER_DISCOVERY_CACHED_SESSION_ELAPSED_MS
            if (needsLivenessProbe) {
                val alive =
                    chipClient.awaitVerifyOperationalReachability(
                        devicePointer,
                        AppConstants.MATTER_DISCOVERY_LIVENESS_TIMEOUT_MS.toInt(),
                    )
                if (!alive) {
                    Log.i(
                        TAG,
                        "$LOG_PREFIX pollCycle #$cycle liveness failed: matterNodeId=$matterNodeIdHex " +
                            "wasReachable=$wasReachable connectElapsedMs=$connectElapsedMs",
                    )
                    lastKnownHostByNodeId.remove(matterNodeIdHex)
                    lastKnownPortByNodeId.remove(matterNodeIdHex)
                    if (wasReachable && reachableNodeIds.remove(matterNodeIdHex)) {
                        Log.i(
                            TAG,
                            "$LOG_PREFIX pollCycle #$cycle LOST: matterNodeId=$matterNodeIdHex " +
                                "(cached session stale or device offline)",
                        )
                        emitDiscoveryLost(matterNodeIdHex)
                        return ProbeOutcome.LOST
                    }
                    return ProbeOutcome.UNREACHABLE
                }
            }

            lastKnownHostByNodeId[matterNodeIdHex] = host
            lastKnownPortByNodeId[matterNodeIdHex] = port

            if (!wasReachable) {
                reachableNodeIds.add(matterNodeIdHex)
                Log.i(
                    TAG,
                    "$LOG_PREFIX pollCycle #$cycle DISCOVERED: matterNodeId=$matterNodeIdHex " +
                        "host=$host port=$port elapsedMs=$connectElapsedMs",
                )
                emitDiscoveryUpdate(matterNodeIdHex, host, port, devicePointer)
                ProbeOutcome.NEWLY_DISCOVERED
            } else {
                Log.v(
                    TAG,
                    "$LOG_PREFIX pollCycle #$cycle still reachable: matterNodeId=$matterNodeIdHex " +
                        "host=$host port=$port",
                )
                ProbeOutcome.STILL_REACHABLE
            }
        } catch (e: Exception) {
            val elapsedMs = System.currentTimeMillis() - probeStartMs
            // Elevated to WARN + [MatterProbe] tag: this is where operational
            // discovery / CASE fails (e.g. CHIP 0x32 AddressResolve Timeout =
            // device not resolved on mDNS). Must be visible at non-debug level.
            Log.w(
                TAG,
                "[MatterProbe] $LOG_PREFIX pollCycle #$cycle probe FAILED (operational resolve/CASE): " +
                    "matterNodeId=$matterNodeIdHex deviceId=$deviceId elapsedMs=$elapsedMs " +
                    "error=${e.javaClass.simpleName}: ${e.message}",
            )
            if (wasReachable && reachableNodeIds.remove(matterNodeIdHex)) {
                lastKnownHostByNodeId.remove(matterNodeIdHex)
                lastKnownPortByNodeId.remove(matterNodeIdHex)
                Log.i(
                    TAG,
                    "$LOG_PREFIX pollCycle #$cycle LOST: matterNodeId=$matterNodeIdHex " +
                        "(was reachable, CHIP connection failed)",
                )
                emitDiscoveryLost(matterNodeIdHex)
                ProbeOutcome.LOST
            } else {
                ProbeOutcome.UNREACHABLE
            }
        }
    }

    private fun formatMatterDeviceId(matterNodeIdHex: String, deviceId: Long): String {
        val unsignedHex = matterNodeIdHex.padStart(16, '0').takeLast(16).uppercase()
        return "deviceIdBits=$deviceId unsignedHex=0x$unsignedHex"
    }

    /**
     * Keeps the Wi-Fi radio listening for mDNS multicast while CHIP browses `_matter._tcp`.
     * Without this, many Android devices drop operational browse responses.
     */
    private fun acquireMulticastLock() {
        if (multicastLock?.isHeld == true) {
            return
        }
        try {
            val wifiManager = reactApplicationContext.applicationContext
                .getSystemService(Context.WIFI_SERVICE) as? WifiManager
            if (wifiManager == null) {
                Log.w(TAG, "$LOG_PREFIX acquireMulticastLock: WifiManager unavailable")
                return
            }
            multicastLock = wifiManager.createMulticastLock("MatterDiscoveryModule").apply {
                setReferenceCounted(true)
                acquire()
            }
            Log.d(TAG, "$LOG_PREFIX acquireMulticastLock: acquired")
        } catch (e: Exception) {
            Log.w(TAG, "$LOG_PREFIX acquireMulticastLock failed: ${e.message}")
        }
    }

    private fun releaseMulticastLock() {
        try {
            if (multicastLock?.isHeld == true) {
                multicastLock?.release()
                Log.d(TAG, "$LOG_PREFIX releaseMulticastLock: released")
            }
        } catch (e: Exception) {
            Log.w(TAG, "$LOG_PREFIX releaseMulticastLock failed: ${e.message}")
        } finally {
            multicastLock = null
        }
    }

    private fun matterNodeIdHexToLong(matterNodeIdHex: String): Long? {
        return try {
            BigInteger(matterNodeIdHex, 16).toLong()
        } catch (e: Exception) {
            Log.e(
                TAG,
                "$LOG_PREFIX invalid matterNodeIdHex='$matterNodeIdHex': ${e.message}",
                e,
            )
            null
        }
    }

    private fun emitDiscoveryUpdate(
        matterNodeIdHex: String,
        host: String,
        port: Int,
        devicePointer: Long,
    ) {
        val fabric = FabricSessionManager.getCurrentFabric()
        val paddedNodeId = matterNodeIdHex.padStart(16, '0').takeLast(16)
        val serviceName = matterNodeIdHex

        val eventData = WritableNativeMap().apply {
            putString("serviceType", AppConstants.MATTER_OPERATIONAL_SERVICE_TYPE)
            putString("nodeId", paddedNodeId)
            putString("matterNodeId", paddedNodeId)
            putString("serviceName", serviceName)
            putString("baseUrl", "http://$host:$port")
            putString("host", host)
            putInt("port", port)
            fabric?.fabricId?.let { putString("fabricId", it) }
        }

        Log.i(
            TAG,
            "$LOG_PREFIX emit DiscoveryUpdate: matterNodeId=$paddedNodeId host=$host port=$port " +
                "fabricId=${fabric?.fabricId ?: "<none>"} devicePointer=$devicePointer " +
                "serviceType=${AppConstants.MATTER_OPERATIONAL_SERVICE_TYPE}",
        )
        emitEvent("DiscoveryUpdate", eventData)
    }

    private fun emitDiscoveryLost(matterNodeIdHex: String) {
        lastKnownHostByNodeId.remove(matterNodeIdHex)
        lastKnownPortByNodeId.remove(matterNodeIdHex)
        reachableNodeIds.remove(matterNodeIdHex)
        FabricSessionManager.clearCurrentChipClient()

        val fabric = FabricSessionManager.getCurrentFabric()
        val paddedNodeId = matterNodeIdHex.padStart(16, '0').takeLast(16)
        val host = lastKnownHostByNodeId[matterNodeIdHex]
        val port = lastKnownPortByNodeId[matterNodeIdHex]

        val eventData = WritableNativeMap().apply {
            putString("serviceType", AppConstants.MATTER_OPERATIONAL_SERVICE_TYPE)
            putString("nodeId", paddedNodeId)
            putString("matterNodeId", paddedNodeId)
            putString("serviceName", matterNodeIdHex)
            fabric?.fabricId?.let { putString("fabricId", it) }
            if (!host.isNullOrEmpty()) {
                putString("host", host)
                if (port != null) {
                    putInt("port", port)
                    putString("baseUrl", "http://$host:$port")
                }
            }
        }

        Log.i(
            TAG,
            "$LOG_PREFIX emit DiscoveryLost: matterNodeId=$paddedNodeId " +
                "host=${host ?: "<none>"} port=${port ?: "<none>"} " +
                "fabricId=${fabric?.fabricId ?: "<none>"} serviceType=${AppConstants.MATTER_OPERATIONAL_SERVICE_TYPE}",
        )
        emitEvent("DiscoveryLost", eventData)
    }

    private fun emitEvent(eventName: String, eventData: WritableNativeMap) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, eventData)
            Log.d(TAG, "$LOG_PREFIX RN event emitted: $eventName")
        } catch (e: Exception) {
            Log.e(TAG, "$LOG_PREFIX failed to emit $eventName to RN: ${e.message}", e)
        }
    }

    private fun logFabricSnapshot(caller: String) {
        val fabric = FabricSessionManager.getCurrentFabric()
        val hasChipClient = FabricSessionManager.getCurrentChipClient() != null
        if (fabric == null) {
            Log.w(TAG, "$LOG_PREFIX fabricSnapshot($caller): no fabric in session")
            return
        }
        Log.d(
            TAG,
            "$LOG_PREFIX fabricSnapshot($caller): fabricId=${fabric.fabricId} " +
                "groupId=${fabric.groupId} name=${fabric.name} " +
                "hasUserNoc=${!fabric.userNoc.isNullOrEmpty()} hasRootCa=${!fabric.rootCa.isNullOrEmpty()} " +
                "hasIpk=${!fabric.ipk.isNullOrEmpty()} chipClientCached=$hasChipClient",
        )
    }

    private fun formatNodeIdList(nodeIds: List<String>): String {
        if (nodeIds.isEmpty()) return "[]"
        val display = nodeIds.take(8).joinToString(", ")
        return if (nodeIds.size <= 8) "[$display]" else "[$display, …+${nodeIds.size - 8} more]"
    }

    /**
     * Logs how each JS-provided target maps to CHIP DIS log tokens for terminal correlation.
     */
    private fun logTargetVerificationHints(caller: String) {
        if (targetMatterNodeIds.isEmpty()) {
            Log.w(TAG, "$LOG_PREFIX verify($caller): no targets — nothing to match in logcat DIS")
            return
        }
        val fabric = FabricSessionManager.getCurrentFabric()
        Log.i(
            TAG,
            "$LOG_PREFIX verify($caller): rainmakerFabricId=${fabric?.fabricId ?: "<none>"} " +
                "(compressed fabric in DIS logs comes from NOC in Keystore, not this string)",
        )
        for (raw in targetMatterNodeIds) {
            val chipNodeId = raw.padStart(16, '0').takeLast(16).uppercase()
            Log.i(
                TAG,
                "$LOG_PREFIX verify($caller): target hex=$raw → CHIP nodeId=$chipNodeId | " +
                    "grep logcat: 'Resolving.*:$chipNodeId' or 'Lookup.*-$chipNodeId' | " +
                    "Metro grep: '[MatterDiscoveryVerify].*$chipNodeId'",
            )
        }
    }

    private fun formatNetworkLocation(location: chip.devicecontroller.NetworkLocation?): String {
        if (location == null) return "null"
        val ip = location.ipAddress ?: "?"
        return "NetworkLocation(ip=$ip, port=${location.port})"
    }

    private fun ReadableMap.optString(key: String): String {
        return if (hasKey(key) && !isNull(key)) getString(key)?.trim().orEmpty() else ""
    }

    override fun invalidate() {
        Log.i(TAG, "$LOG_PREFIX invalidate: tearing down probe scope")
        stopProbingLoop()
        releaseMulticastLock()
        scope.cancel()
        super.invalidate()
    }
}
