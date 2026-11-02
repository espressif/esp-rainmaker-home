/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// Lives in the CHIP package so it can reach the package-private calls
// that ChipDeviceController itself uses.
package chip.devicecontroller

import android.util.Log
import chip.devicecontroller.model.AttributeWriteRequest
import chip.devicecontroller.model.ChipAttributePath
import chip.devicecontroller.model.ChipEventPath
import chip.devicecontroller.model.InvokeElement
import chip.devicecontroller.model.NodeState
import chip.devicecontroller.model.Status
import java.util.Collections

/**
 * Read, subscribe, write and invoke without the CHIP library's double free.
 *
 * When one of these calls fails at once (dead session, network refused, no
 * free message slot), the CHIP native code reports the error and frees its
 * callback object, but the Java wrapper keeps the freed address and frees it
 * again from its finalizer. That crashes the app minutes later on the
 * FinalizerDaemon thread. These helpers make the same calls as
 * ChipDeviceController and, when the error came back before the call
 * returned, set the wrapper's handle to 0 so the finalizer frees nothing.
 * Each call returns that error, or null when the call was accepted.
 *
 * Mirrors CHIPInteractionModel.jar / libCHIPController.so from connectedhomeip v1.6.1. If a
 * newer library stops freeing on that error path, clearing the handle only leaks the callback.
 * Relies on CHIP internals (package-private calls, the private `callbackHandle` field, and
 * AccessControlClusterHelper's reflection on `encodeToTlv`): re-check them on every CHIP upgrade.
 */
object SafeChipCalls {
    private const val TAG = "SafeChipCalls"

    /** Wrappers whose handle could not be cleared; kept so they are never finalized. */
    private val neverFinalize: MutableList<Any> = Collections.synchronizedList(ArrayList())

    /** Same as [ChipDeviceController.readAttributePath]. */
    fun readAttributePath(
        controller: ChipDeviceController,
        callback: ReportCallback,
        devicePtr: Long,
        attributePaths: List<ChipAttributePath>,
        imTimeoutMs: Int,
    ): Exception? {
        val watch = FailureWatch("read")
        val wrapper = ReportCallbackJni(null, WatchedReportCallback(callback, watch), null)
        return watch.run(wrapper) {
            ChipInteractionClient.read(
                controller.deviceControllerPtr,
                wrapper.getCallbackHandle(),
                devicePtr,
                attributePaths,
                null,
                null,
                true,
                imTimeoutMs,
                null,
            )
        }
    }

    /** Same as the 11-argument [ChipDeviceController.subscribeToPath]. */
    fun subscribeToPath(
        controller: ChipDeviceController,
        established: SubscriptionEstablishedCallback,
        resubscription: ResubscriptionAttemptCallback,
        callback: ReportCallback,
        devicePtr: Long,
        attributePaths: List<ChipAttributePath>,
        eventPaths: List<ChipEventPath>,
        minInterval: Int,
        maxInterval: Int,
        keepSubscriptions: Boolean,
        isFabricFiltered: Boolean,
        imTimeoutMs: Int,
    ): Exception? {
        val watch = FailureWatch("subscribe")
        val wrapper =
            ReportCallbackJni(established, WatchedReportCallback(callback, watch), resubscription)
        return watch.run(wrapper) {
            ChipInteractionClient.subscribe(
                controller.deviceControllerPtr,
                wrapper.getCallbackHandle(),
                devicePtr,
                attributePaths,
                eventPaths,
                null,
                minInterval,
                maxInterval,
                keepSubscriptions,
                isFabricFiltered,
                imTimeoutMs,
                null,
                ChipICDClient.isPeerICDClient(
                    ChipInteractionClient.getFabricIndex(devicePtr),
                    ChipInteractionClient.getRemoteDeviceId(devicePtr),
                ),
            )
        }
    }

    /** Same as [ChipDeviceController.write]. */
    fun write(
        controller: ChipDeviceController,
        callback: WriteAttributesCallback,
        devicePtr: Long,
        requests: List<AttributeWriteRequest>,
        timedRequestTimeoutMs: Int,
        imTimeoutMs: Int,
    ): Exception? {
        val watch = FailureWatch("write")
        val wrapper = WriteAttributesCallbackJni(WatchedWriteCallback(callback, watch))
        return watch.run(wrapper) {
            ChipInteractionClient.write(
                controller.deviceControllerPtr,
                wrapper.getCallbackHandle(),
                devicePtr,
                requests,
                timedRequestTimeoutMs,
                imTimeoutMs,
            )
        }
    }

    /** Same as [ChipDeviceController.invoke]. */
    fun invoke(
        controller: ChipDeviceController,
        callback: InvokeCallback,
        devicePtr: Long,
        element: InvokeElement,
        timedRequestTimeoutMs: Int,
        imTimeoutMs: Int,
    ): Exception? {
        val watch = FailureWatch("invoke")
        val wrapper = InvokeCallbackJni(WatchedInvokeCallback(callback, watch))
        return watch.run(wrapper) {
            ChipInteractionClient.invoke(
                controller.deviceControllerPtr,
                wrapper.getCallbackHandle(),
                devicePtr,
                element,
                timedRequestTimeoutMs,
                imTimeoutMs,
            )
        }
    }

    /**
     * Notes whether an error came back on the calling thread while the call
     * was still running. Only then has the native side freed the callback.
     */
    private class FailureWatch(private val callName: String) {
        @Volatile private var callingThread: Thread? = null
        @Volatile private var errorInsideCall: Exception? = null

        fun noteError(error: Exception?) {
            if (callingThread === Thread.currentThread()) {
                errorInsideCall = error ?: Exception("$callName failed")
            }
        }

        fun run(wrapper: Any, call: () -> Unit): Exception? {
            callingThread = Thread.currentThread()
            try {
                call()
            } finally {
                callingThread = null
                if (errorInsideCall != null) {
                    forgetFreedHandle(wrapper, callName)
                }
            }
            return errorInsideCall
        }
    }

    private fun forgetFreedHandle(wrapper: Any, callName: String) {
        try {
            val field = wrapper.javaClass.getDeclaredField("callbackHandle")
            field.isAccessible = true
            field.setLong(wrapper, 0L)
            Log.w(TAG, "$callName failed at once; cleared the freed callback handle")
        } catch (e: Exception) {
            // Could not clear it: keep the wrapper alive so its finalizer never runs.
            neverFinalize.add(wrapper)
            Log.w(TAG, "$callName failed at once; could not clear handle, keeping wrapper", e)
        }
    }

    private class WatchedReportCallback(
        private val inner: ReportCallback,
        private val watch: FailureWatch,
    ) : ReportCallback {
        override fun onError(
            attributePath: ChipAttributePath?,
            eventPath: ChipEventPath?,
            e: Exception,
        ) {
            watch.noteError(e)
            inner.onError(attributePath, eventPath, e)
        }

        override fun onReport(nodeState: NodeState?) = inner.onReport(nodeState)

        override fun onDone() = inner.onDone()
    }

    private class WatchedWriteCallback(
        private val inner: WriteAttributesCallback,
        private val watch: FailureWatch,
    ) : WriteAttributesCallback {
        override fun onError(attributePath: ChipAttributePath?, e: Exception?) {
            watch.noteError(e)
            inner.onError(attributePath, e)
        }

        override fun onResponse(attributePath: ChipAttributePath?, status: Status?) =
            inner.onResponse(attributePath, status)

        override fun onDone() = inner.onDone()
    }

    private class WatchedInvokeCallback(
        private val inner: InvokeCallback,
        private val watch: FailureWatch,
    ) : InvokeCallback {
        override fun onError(e: Exception?) {
            watch.noteError(e)
            inner.onError(e)
        }

        override fun onResponse(element: InvokeElement?, successCode: Long) =
            inner.onResponse(element, successCode)

        override fun onDone() = inner.onDone()
    }
}
