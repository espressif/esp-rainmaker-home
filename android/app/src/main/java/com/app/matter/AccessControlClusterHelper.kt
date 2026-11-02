/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.matter

import android.util.Log
import chip.devicecontroller.ChipClusterException
import chip.devicecontroller.ChipClusters
import chip.devicecontroller.ChipStructs.AccessControlClusterAccessControlEntryStruct
import chip.devicecontroller.ChipTLVType
import chip.devicecontroller.ChipTLVValueDecoder
import chip.devicecontroller.ReportCallback
import chip.devicecontroller.SafeChipCalls
import chip.devicecontroller.StatusException
import chip.devicecontroller.WriteAttributesCallback
import chip.devicecontroller.model.AttributeWriteRequest
import chip.devicecontroller.model.ChipAttributePath
import chip.devicecontroller.model.ChipEventPath
import chip.devicecontroller.model.NodeState
import chip.devicecontroller.model.Status
import kotlinx.coroutines.DelicateCoroutinesApi
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.future.future
import java.util.concurrent.CompletableFuture
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

class AccessControlClusterHelper constructor(private val chipClient: ChipClient) {

    companion object {
        const val TAG = "AccessControlClusterHelper"
        private const val ACCESS_CONTROL_CLUSTER_ID = 0x1FL
        private const val ACL_ATTRIBUTE_ID = 0L
        // CHIP's own error code for "attribute missing from the report" (ChipClusters uses it too).
        private const val UNSUPPORTED_ATTRIBUTE_ERROR = 134L
    }

    // ACL read and write go through SafeChipCalls, not ChipClusters.AccessControlCluster,
    // so a call that fails at once cannot crash the app later (see SafeChipCalls).
    // Same requests and results as the cluster class: fabric-filtered read, no timeouts.

    suspend fun readAclAttribute(deviceId: Long, endpoint: Int):
            MutableList<AccessControlClusterAccessControlEntryStruct>? {
        val connectedDevicePtr = try {
            chipClient.awaitGetConnectedDevicePointer(deviceId)
        } catch (e: Exception) {
            Log.e(TAG, "Cannot get connected device pointer for deviceId=$deviceId: ${e.message}")
            return null
        }
        val path = ChipAttributePath.newInstance(endpoint, ACCESS_CONTROL_CLUSTER_ID, ACL_ATTRIBUTE_ID)
        return suspendCoroutine { continuation ->
            var finished = false
            fun succeed(entries: MutableList<AccessControlClusterAccessControlEntryStruct>?) {
                if (finished) return
                finished = true
                continuation.resume(entries)
            }
            fun fail(ex: Exception) {
                if (finished) return
                finished = true
                Log.e(TAG, "ACL read attribute failure", ex)
                continuation.resumeWithException(ex)
            }

            SafeChipCalls.readAttributePath(
                chipClient.chipDeviceController,
                object : ReportCallback {
                    override fun onReport(nodeState: NodeState?) {
                        if (nodeState == null) {
                            fail(ChipClusterException())
                            return
                        }
                        val tlv = nodeState.getEndpointState(endpoint)
                            ?.getClusterState(ACCESS_CONTROL_CLUSTER_ID)
                            ?.getAttributeState(ACL_ATTRIBUTE_ID)
                            ?.tlv
                        if (tlv == null) {
                            fail(ChipClusterException(UNSUPPORTED_ATTRIBUTE_ERROR))
                            return
                        }
                        try {
                            @Suppress("UNCHECKED_CAST")
                            succeed(
                                ChipTLVValueDecoder.decodeAttributeValue<Any>(path, tlv)
                                    as MutableList<AccessControlClusterAccessControlEntryStruct>?
                            )
                        } catch (e: Exception) {
                            fail(e)
                        }
                    }

                    override fun onError(
                        attributePath: ChipAttributePath?,
                        eventPath: ChipEventPath?,
                        e: Exception,
                    ) {
                        fail(e)
                    }
                },
                connectedDevicePtr,
                listOf(path),
                0,
            )
        }
    }

    @OptIn(DelicateCoroutinesApi::class)
    fun readAclAttributeAsync(
        deviceId: Long, endpoint: Int
    ): CompletableFuture<MutableList<AccessControlClusterAccessControlEntryStruct>?> =
        GlobalScope.future { readAclAttribute(deviceId, endpoint) }

    suspend fun writeAclAttribute(
        deviceId: Long,
        endpoint: Int,
        entries: ArrayList<AccessControlClusterAccessControlEntryStruct>
    ) {
        val connectedDevicePtr = try {
            chipClient.awaitGetConnectedDevicePointer(deviceId)
        } catch (e: Exception) {
            Log.e(TAG, "Cannot get connected device pointer for deviceId=$deviceId: ${e.message}")
            return
        }

        val request = AttributeWriteRequest.newInstance(
            endpoint,
            ACCESS_CONTROL_CLUSTER_ID,
            ACL_ATTRIBUTE_ID,
            encodeAclEntries(entries),
        )
        return suspendCoroutine { continuation ->
            var finished = false
            fun fail(ex: Exception) {
                if (finished) return
                finished = true
                Log.e(TAG, "Write ACL attribute failure", ex)
                continuation.resumeWithException(ex)
            }

            SafeChipCalls.write(
                chipClient.chipDeviceController,
                object : WriteAttributesCallback {
                    override fun onResponse(attributePath: ChipAttributePath?, status: Status?) {
                        if (status?.status == Status.Code.Success) {
                            if (finished) return
                            finished = true
                            continuation.resume(Unit)
                        } else {
                            fail(StatusException(status?.status))
                        }
                    }

                    override fun onError(attributePath: ChipAttributePath?, e: Exception?) {
                        fail(e ?: Exception("Write ACL attribute failed"))
                    }
                },
                connectedDevicePtr,
                listOf(request),
                0,
                0,
            )
        }
    }

    /**
     * Encodes the ACL list exactly as ChipClusters.AccessControlCluster.writeAclAttribute does.
     * The library keeps its encoder private, so it is reached by name.
     */
    private fun encodeAclEntries(
        entries: ArrayList<AccessControlClusterAccessControlEntryStruct>
    ): ByteArray {
        val value = ChipTLVType.ArrayType.generateArrayType(entries) { it.encodeTlv() }
        val encoder = ChipClusters.BaseChipCluster::class.java
            .getDeclaredMethod("encodeToTlv", ChipTLVType.BaseTLVType::class.java)
        encoder.isAccessible = true
        return encoder.invoke(null, value) as ByteArray
    }

    @OptIn(DelicateCoroutinesApi::class)
    fun writeAclAttributeAsync(
        deviceId: Long,
        endpoint: Int,
        level: ArrayList<AccessControlClusterAccessControlEntryStruct>
    ): CompletableFuture<Unit> = GlobalScope.future { writeAclAttribute(deviceId, endpoint, level) }
}
