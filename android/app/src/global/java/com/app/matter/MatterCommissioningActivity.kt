/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.matter

import android.app.Activity
import android.content.ComponentName
import android.os.Build
import android.os.Bundle
import org.greenrobot.eventbus.EventBus
import android.text.TextUtils
import android.util.Log
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.RequiresApi
import androidx.appcompat.app.AppCompatActivity
import com.google.android.gms.home.matter.Matter
import com.google.android.gms.home.matter.commissioning.CommissioningRequest

class MatterCommissioningActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "MatterCommissioningActivity"
        const val KEY_ON_BOARD_PAYLOAD = "on_board_payload"
    }

    private lateinit var commissionDeviceLauncher: ActivityResultLauncher<IntentSenderRequest>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        overridePendingTransition(0, 0)
        setup()
        launchCommissioning()
    }

    private fun setup() {
        commissionDeviceLauncher =
            registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
                val resultCode = result.resultCode
                if (resultCode == Activity.RESULT_OK) {
                    finishNoAnim()
                } else {
                    result.data?.let { data ->
                        Log.e(TAG, "Commissioning failed: ${data.extras}")
                    }
                    val message =
                        if (resultCode == Activity.RESULT_CANCELED) {
                            "Matter setup was cancelled."
                        } else {
                            "Matter setup was dismissed or failed."
                        }
                    notifyCommissioningFailure(message)
                    finishNoAnim()
                }
            }
    }

    private fun notifyCommissioningFailure(message: String) {
        try {
            val bundle = Bundle().apply {
                putString(AppConstants.KEY_STATUS, AppConstants.STATUS_ERROR)
                putString(AppConstants.KEY_ERROR_MESSAGE, message)
                putString(AppConstants.KEY_ERROR_MESSAGE_CAMEL, message)
                putBoolean(AppConstants.KEY_SUCCESS, false)
                putString(AppConstants.KEY_SOURCE_CAMEL, AppConstants.GPS_COMMISSIONING_SOURCE)
            }
            EventBus.getDefault().post(
                MatterEvent(AppConstants.EVENT_COMMISSIONING_ERROR, bundle)
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to post commissioning failure event", e)
        }
        try {
            FabricSessionManager.getCurrentChipClient()?.onCommissioningFailed(message)
        } catch (e: Exception) {
            Log.w(TAG, "onCommissioningFailed: ${e.message}")
        }
    }

    @RequiresApi(Build.VERSION_CODES.O_MR1)
    private fun launchCommissioning() {
        val payload: String? = intent.getStringExtra(KEY_ON_BOARD_PAYLOAD)

        val commissionDeviceRequest: CommissioningRequest

        if (TextUtils.isEmpty(payload)) {
            commissionDeviceRequest = CommissioningRequest.builder().setCommissioningService(
                ComponentName(
                    this, ESPMatterCommissioningService::class.java
                )
            ).build()

        } else {
            commissionDeviceRequest = CommissioningRequest.builder().setOnboardingPayload(payload)
                .setCommissioningService(
                    ComponentName(
                        this, ESPMatterCommissioningService::class.java
                    )
                ).build()
        }

        Matter.getCommissioningClient(this).commissionDevice(commissionDeviceRequest)
            .addOnSuccessListener { result ->
                commissionDeviceLauncher.launch(IntentSenderRequest.Builder(result).build())
            }.addOnFailureListener { error ->
                Log.e(TAG, "commissionDevice() failed", error)
                notifyCommissioningFailure(
                    error.message ?: "Could not open Google Play Matter commissioning."
                )
                finishNoAnim()
            }
    }

    override fun onPause() {
        super.onPause()
        overridePendingTransition(0, 0)
    }

    private fun finishNoAnim() {
        finish()
        overridePendingTransition(0, 0)
    }
}
