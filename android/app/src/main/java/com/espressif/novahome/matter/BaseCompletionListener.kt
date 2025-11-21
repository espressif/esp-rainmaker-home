/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.espressif.novahome.matter

import android.util.Log
import chip.devicecontroller.ChipDeviceController

/**
 * ChipDeviceController uses a CompletionListener for callbacks. This is a "base" default implementation for that CompletionListener.
 */
abstract class BaseCompletionListener : ChipDeviceController.CompletionListener {

    companion object {
        private const val TAG: String = "BaseCompletionListener"
    }

    override fun onConnectDeviceComplete() {
        // Default implementation - override in subclass if needed
    }

    override fun onStatusUpdate(status: Int) {
        // Default implementation - override in subclass if needed
    }

    override fun onPairingComplete(code: Long) {
        // Default implementation - override in subclass if needed
    }

    override fun onPairingDeleted(errorCode: Long) {
        // Default implementation - override in subclass if needed
    }

    override fun onCommissioningComplete(nodeId: Long, errorCode: Long) {
        // Default implementation - override in subclass if needed
    }

    override fun onNotifyChipConnectionClosed() {
        // Default implementation - override in subclass if needed
    }

    override fun onCloseBleComplete() {
        // Default implementation - override in subclass if needed
    }

    override fun onError(error: Throwable) {
        error.printStackTrace()
        Log.e(TAG, "onError(): ${error.message}", error)
    }

    override fun onOpCSRGenerationComplete(csr: ByteArray) {
        // Default implementation - override in subclass if needed
    }

    override fun onReadCommissioningInfo(
        vendorId: Int,
        productId: Int,
        wifiEndpointId: Int,
        threadEndpointId: Int
    ) {
        // Default implementation - override in subclass if needed
    }

    override fun onCommissioningStatusUpdate(nodeId: Long, stage: String?, errorCode: Long) {
        // Default implementation - override in subclass if needed
    }
}
