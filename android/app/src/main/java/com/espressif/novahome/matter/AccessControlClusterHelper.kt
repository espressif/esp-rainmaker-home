/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.matter

import android.util.Log
import chip.devicecontroller.ChipClusters
import chip.devicecontroller.ChipStructs
import chip.devicecontroller.ChipStructs.AccessControlClusterAccessControlEntryStruct
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
    }

    suspend fun readAclAttribute(deviceId: Long, endpoint: Int):
            MutableList<AccessControlClusterAccessControlEntryStruct>? {
        val connectedDevicePtr = try {
            chipClient.getConnectedDevicePointer(deviceId)
        } catch (e: IllegalStateException) {
            return null
        }
        return suspendCoroutine { continuation ->

            getAccessControlClusterForDevice(connectedDevicePtr, endpoint).readAclAttribute(object :
                ChipClusters.AccessControlCluster.AclAttributeCallback {
                override fun onSuccess(valueList: MutableList<AccessControlClusterAccessControlEntryStruct>?) {
                    continuation.resume(valueList)
                }

                override fun onError(ex: Exception) {
                    Log.e(TAG, "ACL read attribute failure", ex)
                    continuation.resumeWithException(ex)
                }
            })
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
            chipClient.getConnectedDevicePointer(deviceId)
        } catch (e: IllegalStateException) {
            Log.e(TAG, "Cannot get connected device pointer for deviceId=$deviceId")
            return
        }

        return suspendCoroutine { continuation ->
            getAccessControlClusterForDevice(connectedDevicePtr, endpoint).writeAclAttribute(

                object : ChipClusters.DefaultClusterCallback {

                    override fun onSuccess() {
                        continuation.resume(Unit)
                    }

                    override fun onError(ex: Exception) {
                        Log.e(TAG, "Write ACL attribute failure", ex)
                        continuation.resumeWithException(ex)
                    }
                }, entries
            )
        }
    }

    @OptIn(DelicateCoroutinesApi::class)
    fun writeAclAttributeAsync(
        deviceId: Long,
        endpoint: Int,
        level: ArrayList<AccessControlClusterAccessControlEntryStruct>
    ): CompletableFuture<Unit> = GlobalScope.future { writeAclAttribute(deviceId, endpoint, level) }

    private fun getAccessControlClusterForDevice(
        devicePtr: Long, endpoint: Int
    ): ChipClusters.AccessControlCluster {
        return ChipClusters.AccessControlCluster(devicePtr, endpoint)
    }
}
