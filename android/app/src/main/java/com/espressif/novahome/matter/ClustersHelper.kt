/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.matter

import android.util.Log
import chip.devicecontroller.ChipClusters
import chip.devicecontroller.ChipStructs
import chip.devicecontroller.model.ChipAttributePath
import kotlinx.coroutines.DelicateCoroutinesApi
import matter.tlv.AnonymousTag
import matter.tlv.TlvWriter
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.future.future
import java.util.concurrent.CompletableFuture
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

/**
 * Encapsulates the information of interest when querying a Matter device just after it has been
 * commissioned.

 */
data class DeviceMatterInfo(
    val endpoint: Int,
    val types: List<Long>,
    val serverClusters: List<Any>,
    val clientClusters: List<Any>
)

class ClustersHelper constructor(private val chipClient: ChipClient) {

    companion object {
        const val TAG = "ClustersHelper"
    }

    suspend fun fetchDeviceMatterInfo(nodeId: Long): List<DeviceMatterInfo> {
        val matterDeviceInfoList = arrayListOf<DeviceMatterInfo>()

        val connectedDevicePtr = try {
            Log.d(TAG, "Getting connected device pointer for nodeId: $nodeId")

            kotlinx.coroutines.delay(500)

            val ptr = chipClient.awaitGetConnectedDevicePointer(nodeId)


            if (ptr == 0L) {
                Log.e(TAG, "Invalid device pointer (0) for nodeId $nodeId")
                return emptyList()
            }

            ptr
        } catch (e: IllegalStateException) {
            Log.e(TAG, "Can't get connectedDevicePointer for nodeId $nodeId: ${e.message}")
            e.printStackTrace()
            return emptyList()
        } catch (e: Exception) {
            Log.e(
                TAG,
                "Unexpected error getting connectedDevicePointer for nodeId $nodeId: ${e.message}"
            )
            e.printStackTrace()
            return emptyList()
        }


        try {
            fetchDeviceMatterInfo(nodeId, connectedDevicePtr, 0, matterDeviceInfoList)

        } catch (e: Exception) {
            Log.e(TAG, "Error during recursive fetchDeviceMatterInfo: ${e.message}")
            e.printStackTrace()
            return emptyList()
        }

        return matterDeviceInfoList
    }


    @OptIn(DelicateCoroutinesApi::class)
    fun fetchDeviceMatterInfoAsync(nodeId: Long): CompletableFuture<List<DeviceMatterInfo>> =
        GlobalScope.future { fetchDeviceMatterInfo(nodeId) }

    private suspend fun fetchDeviceMatterInfo(
        nodeId: Long,
        connectedDevicePtr: Long,
        endpointInt: Int,
        matterDeviceInfoList: ArrayList<DeviceMatterInfo>
    ) {
        val partsListAttribute = try {
            readDescriptorClusterPartsListAttribute(connectedDevicePtr, endpointInt)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read parts list for endpoint $endpointInt", e)
            return
        }

        val deviceListAttribute = try {
            readDescriptorClusterDeviceListAttribute(connectedDevicePtr, endpointInt)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read device list for endpoint $endpointInt", e)
            return
        }
        val types = arrayListOf<Long>()
        deviceListAttribute.forEach { types.add(it.deviceType) }

        val serverListAttribute = try {
            readDescriptorClusterServerListAttribute(connectedDevicePtr, endpointInt)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read server list for endpoint $endpointInt", e)
            emptyList<Long>()
        }
        val serverClusters = arrayListOf<Any>()
        serverListAttribute.forEach { serverClusters.add(it) }

        val clientListAttribute = try {
            readDescriptorClusterClientListAttribute(connectedDevicePtr, endpointInt)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read client list for endpoint $endpointInt", e)
            emptyList<Long>()
        }
        val clientClusters = arrayListOf<Any>()
        clientListAttribute.forEach { clientClusters.add(it) }

        val deviceMatterInfo = DeviceMatterInfo(endpointInt, types, serverClusters, clientClusters)
        matterDeviceInfoList.add(deviceMatterInfo)

        partsListAttribute?.forEach { part ->
            try {
                val endpointInt = when (part) {
                    is Int -> part.toInt()
                    else -> {
                        return@forEach
                    }
                }
                fetchDeviceMatterInfo(nodeId, connectedDevicePtr, endpointInt, matterDeviceInfoList)
            } catch (e: Exception) {
                Log.e(TAG, "Error processing endpoint $part", e)
            }
        }
    }

    suspend fun readDescriptorClusterPartsListAttribute(
        devicePtr: Long, endpoint: Int
    ): List<Any>? {
        return suspendCoroutine { continuation ->
            getDescriptorClusterForDevice(devicePtr, endpoint).readPartsListAttribute(object :
                    ChipClusters.DescriptorCluster.PartsListAttributeCallback {
                    override fun onSuccess(values: MutableList<Int>?) {
                        continuation.resume(values)
                    }

                    override fun onError(ex: Exception) {
                        continuation.resumeWithException(ex)
                    }
                })
        }
    }

    suspend fun readDescriptorClusterDeviceListAttribute(
        devicePtr: Long, endpoint: Int
    ): List<ChipStructs.DescriptorClusterDeviceTypeStruct> {
        return suspendCoroutine { continuation ->
            getDescriptorClusterForDevice(devicePtr, endpoint).readDeviceTypeListAttribute(object :
                    ChipClusters.DescriptorCluster.DeviceTypeListAttributeCallback {
                    override fun onSuccess(
                        values: List<ChipStructs.DescriptorClusterDeviceTypeStruct>
                    ) {
                        continuation.resume(values)
                    }

                    override fun onError(ex: Exception) {
                        continuation.resumeWithException(ex)
                    }
                })
        }
    }

    suspend fun readDescriptorClusterServerListAttribute(
        devicePtr: Long, endpoint: Int
    ): List<Long> {
        return suspendCoroutine { continuation ->
            getDescriptorClusterForDevice(devicePtr, endpoint).readServerListAttribute(object :
                    ChipClusters.DescriptorCluster.ServerListAttributeCallback {
                    override fun onSuccess(values: MutableList<Long>) {
                        continuation.resume(values)
                    }

                    override fun onError(ex: Exception) {
                        continuation.resumeWithException(ex)
                    }
                })
        }
    }

    suspend fun readDescriptorClusterClientListAttribute(
        devicePtr: Long, endpoint: Int
    ): List<Long> {
        return suspendCoroutine { continuation ->
            getDescriptorClusterForDevice(devicePtr, endpoint).readClientListAttribute(object :
                    ChipClusters.DescriptorCluster.ClientListAttributeCallback {
                    override fun onSuccess(values: MutableList<Long>) {
                        continuation.resume(values)
                    }

                    override fun onError(ex: Exception) {
                        continuation.resumeWithException(ex)
                    }
                })
        }
    }

    private fun getDescriptorClusterForDevice(
        devicePtr: Long, endpoint: Int
    ): ChipClusters.DescriptorCluster {
        try {

            if (devicePtr == 0L) {
                throw IllegalArgumentException("Invalid device pointer: $devicePtr")
            }
            if (endpoint < 0) {
                throw IllegalArgumentException("Invalid endpoint: $endpoint")
            }

            val cluster = ChipClusters.DescriptorCluster(devicePtr, endpoint)
            Log.d(TAG, "Successfully created DescriptorCluster")
            return cluster

        } catch (e: Exception) {
            Log.e(
                TAG,
                "Failed to create DescriptorCluster for devicePtr: $devicePtr, endpoint: $endpoint",
                e
            )
            throw e
        }
    }


    suspend fun writeEspDeviceAttribute(
        nodeId: Long, endpointId: Int, clusterId: Long, attributeId: Long, matterNodeId: String
    ) {
        val tlvWriter = TlvWriter()
        tlvWriter.put(AnonymousTag, matterNodeId)

        val devicePtr = chipClient.awaitGetConnectedDevicePointer(nodeId)
        val attributePath = ChipAttributePath.newInstance(endpointId, clusterId, attributeId)

        chipClient.writeAttribute(devicePtr, attributePath, tlvWriter.getEncoded())
    }
}
