/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.matter

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log
import com.google.android.gms.home.matter.commissioning.CommissioningService
import com.google.android.gms.home.matter.commissioning.CommissioningCompleteMetadata
import com.google.android.gms.home.matter.commissioning.CommissioningRequestMetadata
import com.google.android.gms.home.matter.commissioning.CommissioningService.CommissioningError
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.greenrobot.eventbus.EventBus

/**
 *
 * This service handles the actual Matter device commissioning using Google Play Services.
 */
class ESPMatterCommissioningService : Service(), CommissioningService.Callback {

    companion object {
        private const val TAG = "ESPMatterCommissioningService"
    }

    private val serviceJob = Job()
    private val serviceScope = CoroutineScope(Dispatchers.Main + serviceJob)
    private lateinit var commissioningServiceDelegate: CommissioningService

    private lateinit var chipClient: ChipClient

    override fun onCreate() {
        super.onCreate()
        val fabricInfo = FabricSessionManager.getCurrentFabric()
        Log.d(TAG, "Retrieved fabric info: ${fabricInfo?.name ?: "None"}")

        if (fabricInfo?.groupId != null) {
            chipClient = ChipClient(
                applicationContext,
                fabricInfo.groupId!!,
                fabricInfo.fabricId!!,
                fabricInfo.rootCa!!,
                fabricInfo.userNoc ?: "",
                fabricInfo.ipk!!,
                fabricInfo.groupCatIdOperate!!
            )
            FabricSessionManager.setCurrentChipClient(chipClient)
        } else {
            chipClient = ChipClient(applicationContext, "", "", "", "", "", "")
            FabricSessionManager.setCurrentChipClient(chipClient)
        }

        commissioningServiceDelegate = CommissioningService.Builder(this)
            .setCallback(this)
            .build()
    }

    override fun onBind(intent: Intent): IBinder {
        return commissioningServiceDelegate.asBinder()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return super.onStartCommand(intent, flags, startId)
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "onDestroy()")
        serviceJob.cancel()
    }

    override fun onCommissioningRequested(metadata: CommissioningRequestMetadata) {
        val fabricInfo = FabricSessionManager.getCurrentFabric()
        if (fabricInfo?.groupId == null) {
            Log.e(TAG, "No fabric details found cannot proceed with commissioning")
            sendCommissioningError(CommissioningError.OTHER)
            sendCommissioningErrorEvent("Missing fabric details. Please try again.")
            return
        }

        val deviceId = System.currentTimeMillis()

        var matterNodeId: Long? = null
        var actualDeviceName: String? = null

        serviceScope.launch {
            try {
                chipClient?.awaitEstablishPaseConnection(
                    deviceId,
                    metadata.networkLocation.ipAddress.hostAddress!!,
                    metadata.networkLocation.port,
                    metadata.passcode
                )

                chipClient?.awaitCommissionDevice(deviceId, null)

                matterNodeId = chipClient?.lastCommissionedNodeId
                actualDeviceName = chipClient?.lastCommissionedDeviceName

                val completeMetadata = CommissioningCompleteMetadata.builder()
                    .setToken(AppConstants.COMMISSIONING_TOKEN_PREFIX + deviceId)
                    .build()

                commissioningServiceDelegate
                    .sendCommissioningComplete(completeMetadata)
                    .addOnSuccessListener {
                        val finalDeviceId = matterNodeId?.toString() ?: deviceId.toString()
                        val finalDeviceName = actualDeviceName ?: AppConstants.DEFAULT_MATTER_DEVICE_NAME

                        sendCommissioningCompleteEvent(finalDeviceId, finalDeviceName)
                    }
                    .addOnFailureListener { e ->
                        Log.e(
                            TAG,
                            "Failed to send success to GPS: ${e.message}")
                    }

            } catch (e: Exception) {
                Log.e(
                    TAG,
                    "Exception during GPS commissioning: ${e.message}",
                    e
                )

                // Send error to GPS
                commissioningServiceDelegate
                    .sendCommissioningError(CommissioningError.OTHER)
                    .addOnSuccessListener {
                        Log.d(TAG, "Error sent to GPS")
                    }
                    .addOnFailureListener { e2 ->
                        Log.e(
                            TAG,
                            "Failed to send error to GPS: ${e2.message}"
                        )
                    }

                val message =
                    e.message ?: "Matter commissioning failed. Please try again."
                sendCommissioningErrorEvent(message)
            }
        }
    }


    /**
     * Send commissioning complete event via EventBus
     * This event will be picked up by ESPMatterCommissioningModule and forwarded to React Native
     */
    private fun sendCommissioningCompleteEvent(
        deviceId: String,
        deviceName: String
    ) {
        try {
            val currentFabric = FabricSessionManager.getCurrentFabric()
            val fabricName = currentFabric?.name ?: "Unknown Fabric"

            val eventData = android.os.Bundle().apply {
                putString(AppConstants.KEY_STATUS, "success")
                putString(AppConstants.KEY_DEVICE_ID, deviceId)
                putString(AppConstants.KEY_DEVICE_NAME, deviceName)
                putString(AppConstants.KEY_FABRIC_NAME, fabricName)
                putString(AppConstants.KEY_MESSAGE, AppConstants.GPS_COMMISSIONING_SUCCESS)
                putString(AppConstants.KEY_SOURCE, AppConstants.GPS_COMMISSIONING_SOURCE)
            }

            val commissioningCompleteEvent =
                MatterEvent(AppConstants.EVENT_COMMISSIONING_COMPLETE, eventData)
            EventBus.getDefault().post(commissioningCompleteEvent)

        } catch (e: Exception) {
            Log.e(TAG, "Failed to send commissioning complete event: ${e.message}", e)
        }
    }

    private fun sendCommissioningError(error: Int) {
        commissioningServiceDelegate
            .sendCommissioningError(error)
            .addOnSuccessListener {
                Log.d(TAG, "Commissioning error sent to Google Play Services")
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "Failed to send commissioning error to GPS: ${e.message}")
            }
    }

    private fun sendCommissioningErrorEvent(message: String) {
        try {
            val bundle = android.os.Bundle().apply {
                putString(AppConstants.KEY_STATUS, AppConstants.STATUS_ERROR)
                putString(AppConstants.KEY_ERROR_MESSAGE, message)
            }
            EventBus.getDefault().post(
                MatterEvent(AppConstants.EVENT_COMMISSIONING_ERROR, bundle)
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send commissioning error event: ${e.message}", e)
        }
    }
}
